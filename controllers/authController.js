const { pool } = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const config = require("../config/config");

exports.signup = async (req, res) => {
  const {
    id_number,
    first_name,
    middle_name,
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

    const [department] = await connection.query(
      "SELECT 1 FROM departments WHERE id = ?",
      [department_id]
    );
    if (!department.length) {
      throw { status: 400, message: "Invalid department ID." };
    }

    const [emailExists] = await connection.query(
      `
      SELECT email FROM users WHERE LOWER(email) = LOWER(?)
      UNION ALL
      SELECT email FROM admins WHERE LOWER(email) = LOWER(?)
      `,
      [email, email]
    );
    if (emailExists.length) {
      throw { status: 400, message: "Email is already in use." };
    }

    const [user] = await connection.query(
      `SELECT users.*, roles.name AS role_name, blocks.department_id 
       FROM users 
       LEFT JOIN roles ON users.role_id = roles.id
       LEFT JOIN blocks ON users.block_id = blocks.id
       WHERE users.id_number = ? 
       AND LOWER(users.first_name) = LOWER(?) 
       AND LOWER(users.middle_name) = LOWER(?) 
       AND LOWER(users.last_name) = LOWER(?) 
       AND COALESCE(users.suffix, '') = COALESCE(?, '') 
       AND blocks.department_id = ?`,
      [id_number, first_name, middle_name, last_name, suffix, department_id]
    );

    if (!user.length) {
      throw { status: 400, message: "User data does not match." };
    }

    if (user[0].role_name === "Admin" || user[0].role_name === "Super Admin") {
      throw {
        status: 403,
        message: "Admins cannot sign up through this portal.",
      };
    }

    if (user[0].password_hash) {
      throw {
        status: 400,
        message: "User already has an account. Please log in.",
      };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await connection.query(
      "UPDATE users SET email = ?, password_hash = ? WHERE id_number = ?",
      [email, hashedPassword, id_number]
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "User account successfully created.",
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error in signup:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal server error",
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

    const [accountData] = await connection.query(
      `
      SELECT users.id_number, users.first_name, users.last_name, users.email, users.password_hash, 
             roles.name AS role, users.block_id, blocks.department_id, blocks.year_level_id 
      FROM users 
      LEFT JOIN roles ON users.role_id = roles.id
      LEFT JOIN blocks ON users.block_id = blocks.id
      WHERE users.id_number = ?
      UNION ALL
      SELECT admins.id_number, admins.first_name, admins.last_name, admins.email, admins.password_hash, 
             roles.name AS role, NULL AS block_id, admins.department_id, NULL AS year_level_id 
      FROM admins 
      LEFT JOIN roles ON admins.role_id = roles.id
      WHERE admins.id_number = ?
      `,
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
      { id: account.id_number, id_number, role: account.role },
      config.JWT_SECRET_KEY,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: account.id_number,
        id_number,
        first_name: account.first_name,
        last_name: account.last_name,
        email: account.email,
        role: account.role,
        department_id: account.department_id,
        block_id: account.role === "user" ? account.block_id : null,
        year_level_id: account.role === "user" ? account.year_level_id : null,
      },
    });
  } catch (error) {
    console.error("Error in login:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
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
    await connection.beginTransaction();

    const [user] = await connection.query(
      "SELECT id_number FROM users WHERE LOWER(email) = LOWER(?)",
      [email]
    );
    const [admin] = await connection.query(
      "SELECT id_number FROM admins WHERE LOWER(email) = LOWER(?)",
      [email]
    );

    if (!user.length && !admin.length) {
      throw { status: 404, message: "User not found." };
    }

    const resetCode = Math.floor(10000 + Math.random() * 90000);

    await connection.query("DELETE FROM password_reset_codes WHERE email = ?", [
      email,
    ]);

    await connection.query(
      "INSERT INTO password_reset_codes (email, reset_code, created_at, used) VALUES (?, ?, NOW(), false)",
      [email, resetCode]
    );

    await connection.commit();

    res
      .status(200)
      .json({ success: true, message: "Password reset request received." });

    sendResetEmail(email, resetCode);
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error in resetPassword:", error);

    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  } finally {
    if (connection) connection.release();
  }
};

const sendResetEmail = async (email, resetCode) => {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.zoho.com",
      port: 465,
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

    console.log(`Password reset email sent to ${email}`);
  } catch (error) {
    console.error("Error sending reset email:", error);
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
      "SELECT id_number FROM users WHERE LOWER(email) = LOWER(?)",
      [email]
    );
    const [admin] = await connection.query(
      "SELECT id_number FROM admins WHERE LOWER(email) = LOWER(?)",
      [email]
    );

    if (!user.length && !admin.length) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const [codeRecord] = await connection.query(
      "SELECT id FROM password_reset_codes WHERE LOWER(email) = LOWER(?) AND reset_code = ? AND created_at >= NOW() - INTERVAL 15 MINUTE AND used = false",
      [email, parseInt(reset_code, 10)]
    );

    if (!codeRecord.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset code.",
      });
    }

    await connection.query(
      "UPDATE password_reset_codes SET used = true WHERE id = ?",
      [codeRecord[0].id]
    );

    return res.status(200).json({
      success: true,
      message: "Reset code verified successfully.",
    });
  } catch (error) {
    console.error("Error in confirmPassword:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  } finally {
    if (connection) connection.release();
  }
};
