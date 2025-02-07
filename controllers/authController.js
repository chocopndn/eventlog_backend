const { pool } = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const config = require("../config/config");

const handleError = (res, error, defaultMessage = "Internal server error") => {
  return res.status(error.status || 500).json({
    success: false,
    message: error.message || defaultMessage,
  });
};

const getUserQuery = () => {
  return `
    SELECT 
      users.id_number, 
      users.first_name, 
      users.middle_name,
      users.last_name, 
      users.suffix,
      users.email, 
      roles.name AS role_name,
      year_levels.name AS year_level_name,
      blocks.name AS block_name,
      departments.name AS department_name
    FROM users
    LEFT JOIN roles ON users.role_id = roles.id
    LEFT JOIN blocks ON users.block_id = blocks.id
    LEFT JOIN departments ON blocks.department_id = departments.id
    LEFT JOIN year_levels ON blocks.year_level_id = year_levels.id
  `;
};

exports.signup = async (req, res) => {
  const {
    id_number,
    first_name,
    middle_name = null,
    last_name,
    suffix = null,
    email,
    password,
    department_id,
  } = req.body;

  if (
    !id_number ||
    !first_name ||
    !last_name ||
    !email ||
    !password ||
    !department_id
  ) {
    return res.status(400).json({
      success: false,
      message: "All required fields must be provided.",
    });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [userRecords] = await connection.query(
      `SELECT users.*, blocks.department_id
       FROM users
       JOIN blocks ON users.block_id = blocks.id
       WHERE users.id_number = ? 
       AND users.first_name = ? 
       AND (users.middle_name IS NULL OR users.middle_name = ?)
       AND users.last_name = ? 
       AND (users.suffix IS NULL OR users.suffix = ?)
       AND blocks.department_id = ?`,
      [id_number, first_name, middle_name, last_name, suffix, department_id]
    );

    if (!userRecords.length) {
      throw { status: 400, message: "User data does not match." };
    }

    const existingUser = userRecords[0];

    if (existingUser.password_hash) {
      throw {
        status: 400,
        message: "User already has an account. Please log in.",
      };
    }

    const [emailRecords] = await connection.query(
      `SELECT email FROM users WHERE LOWER(email) = LOWER(?) 
       UNION 
       SELECT email FROM admins WHERE LOWER(email) = LOWER(?)`,
      [email, email]
    );

    if (emailRecords.length) {
      throw { status: 400, message: "Email is already in use." };
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await connection.query(
      "UPDATE users SET email = ?, password_hash = ? WHERE id_number = ?",
      [email, hashedPassword, id_number]
    );

    await connection.commit();

    return res
      .status(200)
      .json({ success: true, message: "User account successfully created." });
  } catch (error) {
    if (connection) await connection.rollback();
    return handleError(res, error);
  } finally {
    if (connection) connection.release();
  }
};

exports.login = async (req, res) => {
  const { id_number, password } = req.body;

  if (!id_number || !password) {
    return res.status(400).json({
      success: false,
      message: "ID number and password are required.",
    });
  }

  let connection;
  try {
    connection = await pool.getConnection();

    const [accountData] = await connection.query(
      `SELECT 
          users.id_number, 
          users.first_name, 
          users.last_name, 
          users.email, 
          users.password_hash, 
          users.block_id, 
          blocks.department_id, 
          users.role_id 
       FROM users 
       LEFT JOIN blocks ON users.block_id = blocks.id 
       WHERE users.id_number = ? 
       UNION 
       SELECT 
          admins.id_number, 
          admins.first_name, 
          admins.last_name, 
          admins.email, 
          admins.password_hash, 
          NULL AS block_id, 
          admins.department_id, 
          admins.role_id 
       FROM admins
       WHERE admins.id_number = ?`,
      [id_number, id_number]
    );

    if (!accountData.length) {
      return res
        .status(404)
        .json({ success: false, message: "Account not found." });
    }

    const account = accountData[0];

    const isPasswordValid = await bcrypt.compare(
      password,
      account.password_hash
    );
    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid password." });
    }

    const token = jwt.sign(
      { id: account.id_number, role: account.role_id },
      config.JWT_SECRET_KEY,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id_number: account.id_number,
        first_name: account.first_name,
        last_name: account.last_name,
        email: account.email,
        block_id: account.block_id,
        department_id: account.department_id,
        role_id: account.role_id,
      },
    });
  } catch (error) {
    return handleError(res, error);
  } finally {
    if (connection) connection.release();
  }
};

exports.resetPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res
      .status(400)
      .json({ success: false, message: "Email is required." });
  }

  let connection;
  try {
    connection = await pool.getConnection();

    const [user] = await connection.query(
      "SELECT id_number FROM users WHERE email = ?",
      [email]
    );
    const [admin] = await connection.query(
      "SELECT id_number FROM admins WHERE email = ?",
      [email]
    );

    if (!user.length && !admin.length) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const resetCode = Math.floor(10000 + Math.random() * 90000);

    await connection.query("DELETE FROM password_reset_codes WHERE email = ?", [
      email,
    ]);
    await connection.query(
      "INSERT INTO password_reset_codes (email, reset_code, created_at, used) VALUES (?, ?, NOW(), 0)",
      [email, resetCode]
    );

    res
      .status(200)
      .json({ success: true, message: "Password reset request received." });

    sendResetEmail(email, resetCode);
  } catch (error) {
    return handleError(res, error, "Error while resetting password.");
  } finally {
    if (connection) connection.release();
  }
};

exports.confirmPassword = async (req, res) => {
  const { email, reset_code } = req.body;

  if (!email || !reset_code || !/^\d{5}$/.test(reset_code)) {
    return res.status(400).json({
      success: false,
      message: "Invalid input. Email and a 5-digit reset code are required.",
    });
  }

  let connection;
  try {
    connection = await pool.getConnection();

    const [user] = await connection.query(
      "SELECT id_number FROM users WHERE email = ?",
      [email]
    );
    const [admin] = await connection.query(
      "SELECT id_number FROM admins WHERE email = ?",
      [email]
    );

    if (!user.length && !admin.length) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const [codeRecord] = await connection.query(
      "SELECT id FROM password_reset_codes WHERE email = ? AND reset_code = ? AND created_at >= NOW() - INTERVAL 5 MINUTE AND used = 0",
      [email, reset_code]
    );

    if (!codeRecord.length) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired reset code." });
    }

    await connection.query(
      "UPDATE password_reset_codes SET used = 1 WHERE id = ?",
      [codeRecord[0].id]
    );

    return res
      .status(200)
      .json({ success: true, message: "Reset code verified successfully." });
  } catch (error) {
    return handleError(res, error);
  } finally {
    if (connection) connection.release();
  }
};
