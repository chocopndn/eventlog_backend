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
      `SELECT * FROM view_users 
       WHERE id_number = ? AND first_name = ? AND last_name = ? AND department_id = ?`,
      [id_number, first_name, last_name, department_id]
    );

    if (!userRecords.length) {
      return res.status(400).json({
        success: false,
        message: "User data does not match.",
      });
    }

    const user = userRecords[0];

    if (user.status === "Active") {
      return res.status(400).json({
        success: false,
        message: "User already registered. Please log in.",
      });
    }

    if (user.status === "Disabled") {
      return res.status(403).json({
        success: false,
        message: "Account is disabled. Please contact the administrator.",
      });
    }

    if (user.status === "Unregistered") {
      const middleNameMatch =
        (user.middle_name === null && middle_name === null) ||
        user.middle_name === middle_name;
      const suffixMatch =
        (user.suffix === null && suffix === null) || user.suffix === suffix;

      if (!middleNameMatch || !suffixMatch) {
        return res.status(400).json({
          success: false,
          message: "User data does not match.",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      await connection.query(
        `UPDATE users SET email = ?, password_hash = ?, status = 'Active' WHERE id_number = ?`,
        [email, hashedPassword, id_number]
      );

      await connection.commit();

      return res.status(200).json({
        success: true,
        message: "User account successfully registered.",
      });
    }
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

    const [userData] = await connection.query(
      "SELECT id_number, password_hash, status FROM users WHERE id_number = ?",
      [id_number]
    );

    const [adminData] = await connection.query(
      "SELECT id_number, password_hash, status FROM admins WHERE id_number = ?",
      [id_number]
    );

    const account = userData[0] || adminData[0];

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Account not found. Please sign up.",
      });
    }

    if (account.status === "Disabled") {
      return res.status(403).json({
        success: false,
        message:
          "Your account has been disabled. Please contact the administrator.",
      });
    }

    if (!account.password_hash) {
      return res.status(401).json({
        success: false,
        message:
          "Your account isn't registered yet. Please sign up to continue.",
      });
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      account.password_hash
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid password.",
      });
    }

    const token = jwt.sign(
      { id: account.id_number, role: account.role_id },
      config.JWT_SECRET_KEY
    );

    let query = "";
    if (userData[0]) {
      query = "SELECT * FROM view_users WHERE id_number = ?";
    } else if (adminData[0]) {
      query = "SELECT * FROM view_admins WHERE id_number = ?";
    }

    const [userDetails] = await connection.query(query, [id_number]);

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: userDetails[0],
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
    const [user, admin] = await Promise.all([
      connection.query("SELECT id_number FROM view_users WHERE email = ?", [
        email,
      ]),
      connection.query("SELECT id_number FROM view_admins WHERE email = ?", [
        email,
      ]),
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
    return handleError(res, error);
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
      auth: { user: config.EMAIL_USER, pass: config.EMAIL_PASS },
    });

    await transporter.sendMail({
      from: '"Eventlog" <eventlogucv@zohomail.com>',
      to: email,
      subject: "Password Reset Request",
      text: `Your password reset code is: ${resetCode}`,
      html: `<p>Your password reset code is: <b>${resetCode}</b></p>`,
    });
  } catch (error) {}
};

exports.confirmPassword = async (req, res) => {
  const { email, reset_code } = req.body;

  if (!email || !reset_code || !/^\d{5}$/.test(reset_code)) {
    return res.status(400).json({
      success: false,
      message:
        "Invalid input. Email and a valid 5-digit reset code are required.",
    });
  }

  let connection;
  try {
    connection = await pool.getConnection();
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
