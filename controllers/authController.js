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
      `SELECT users.id_number, users.first_name, users.middle_name, users.last_name, users.suffix, 
              users.password_hash, blocks.department_id
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
      return res
        .status(400)
        .json({ success: false, message: "User data does not match." });
    }

    const existingUser = userRecords[0];

    if (existingUser.password_hash) {
      return res.status(400).json({
        success: false,
        message: "User already has an account. Please log in.",
      });
    }

    const [emailRecords] = await connection.query(
      `SELECT email FROM users WHERE LOWER(email) = LOWER(?) 
       UNION 
       SELECT email FROM admins WHERE LOWER(email) = LOWER(?)`,
      [email, email]
    );

    if (emailRecords.length) {
      return res
        .status(400)
        .json({ success: false, message: "Email is already in use." });
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
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
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

    const [userData] = await connection.query(
      `SELECT 
          users.id_number, 
          users.first_name, 
          users.last_name, 
          users.email, 
          users.password_hash, 
          users.block_id, 
          blocks.name AS block_name, 
          blocks.department_id, 
          departments.name AS department_name,
          users.role_id 
       FROM users 
       LEFT JOIN blocks ON users.block_id = blocks.id 
       LEFT JOIN departments ON blocks.department_id = departments.id
       WHERE users.id_number = ?`,
      [id_number]
    );

    const [adminData] = await connection.query(
      `SELECT 
          admins.id_number, 
          admins.first_name, 
          admins.last_name, 
          admins.email, 
          admins.password_hash, 
          admins.department_id, 
          departments.name AS department_name,
          admins.role_id 
       FROM admins
       LEFT JOIN departments ON admins.department_id = departments.id
       WHERE admins.id_number = ?`,
      [id_number]
    );

    const account = userData[0] || adminData[0];

    if (!account || !account.password_hash) {
      return res.status(404).json({
        success: false,
        message: "Account not found. Please sign up.",
      });
    }

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
      config.JWT_SECRET_KEY
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
        block_id: account.block_id || null,
        block_name: account.block_name || null,
        department_id: account.department_id,
        department_name: account.department_name,
        role_id: account.role_id,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
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

    const [user, admin] = await Promise.all([
      connection.query("SELECT id_number FROM users WHERE email = ?", [email]),
      connection.query("SELECT id_number FROM admins WHERE email = ?", [email]),
    ]);

    if (!user[0].length && !admin[0].length) {
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
    res.status(500).json({ success: false, message: "Internal server error" });
  } finally {
    if (connection) connection.release();
  }
};

const sendResetEmail = async (email, resetCode) => {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.zoho.com",
      port: 465,
      secure: true,
      auth: {
        user: config.EMAIL_USER,
        pass: config.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: '"Eventlog" <eventlogucv@zohomail.com>',
      to: email,
      subject: "Password Reset Request",
      text: `Your password reset code is: ${resetCode}`,
      html: `<p>Your password reset code is: <b>${resetCode}</b></p>`,
    });

    console.log(`Reset email sent to ${email}`);
  } catch (error) {
    console.error("Error sending reset email:", error);
  }
};

exports.confirmPassword = async (req, res) => {
  const { email, reset_code } = req.body;

  if (!email || !reset_code || !/^\d{5}$/.test(reset_code)) {
    return res.status(400).json({
      success: false,
      message:
        "Invalid input. Email and a valid 5 or 6-digit reset code are required.",
    });
  }

  let connection;
  try {
    connection = await pool.getConnection();

    const [user, admin] = await Promise.all([
      connection.query("SELECT id_number FROM users WHERE email = ?", [email]),
      connection.query("SELECT id_number FROM admins WHERE email = ?", [email]),
    ]);

    if (!user[0].length && !admin[0].length) {
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
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  } finally {
    if (connection) connection.release();
  }
};
