const { pool } = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const config = require("../config/config");

exports.signup = async (req, res) => {
  const {
    student_id,
    first_name,
    middle_name,
    last_name,
    suffix = null,
    email,
    password,
    department_id,
  } = req.body;

  try {
    const [department] = await pool.query(
      "SELECT 1 FROM department WHERE department_id = ?",
      [department_id]
    );
    if (!department.length) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid department ID." });
    }

    const [user] = await pool.query(
      `SELECT * FROM users 
       WHERE student_id = ? 
       AND LOWER(first_name) = LOWER(?) 
       AND LOWER(middle_name) = LOWER(?) 
       AND LOWER(last_name) = LOWER(?) 
       AND COALESCE(suffix, '') = COALESCE(?, '') 
       AND department_id = ?`,
      [student_id, first_name, middle_name, last_name, suffix, department_id]
    );

    if (!user.length) {
      return res.status(400).json({
        success: false,
        message: "Student data does not match. User not created.",
      });
    }

    if (user[0].password) {
      return res.status(400).json({
        success: false,
        message: "User already has an account. Please log in.",
      });
    }

    const [existingEmail] = await pool.query(
      "SELECT 1 FROM users WHERE email = ?",
      [email]
    );
    if (existingEmail.length) {
      return res
        .status(400)
        .json({ success: false, message: "Email is already in use." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      "UPDATE users SET email = ?, password = ? WHERE student_id = ?",
      [email, hashedPassword, student_id]
    );

    return res
      .status(200)
      .json({ success: true, message: "User account successfully created." });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.login = async (req, res) => {
  const { id_number, password } = req.body;

  try {
    const [user] = await pool.query(
      `SELECT u.*, d.department_id, b.block_id 
       FROM users u
       LEFT JOIN department d ON u.department_id = d.department_id
       LEFT JOIN block b ON u.block_id = b.block_id
       WHERE u.student_id = ?`,
      [id_number]
    );

    const [admin] = await pool.query(
      "SELECT * FROM admins WHERE admin_id = ?",
      [id_number]
    );

    let account = null;
    let role = "";

    if (user.length) {
      account = user[0];
      role = "user";
    } else if (admin.length) {
      account = admin[0];
      role = "admin";
    }

    if (!account) {
      return res
        .status(404)
        .json({ success: false, message: "Account not found." });
    }

    const isPasswordValid = await bcrypt.compare(password, account.password);
    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid password." });
    }

    const token = jwt.sign(
      { id: account.id, id_number, role },
      config.JWT_SECRET_KEY,
      { expiresIn: "7d" }
    );

    if (role === "admin") {
      return res.status(200).json({
        success: true,
        message: "Login successful.",
        token,
        user: {
          id: account.id,
          id_number,
          first_name: account.first_name,
          last_name: account.last_name,
          email: account.email,
          role: account.role,
        },
      });
    } else {
      return res.status(200).json({
        success: true,
        message: "Login successful.",
        token,
        user: {
          id: account.id,
          id_number,
          first_name: account.first_name,
          last_name: account.last_name,
          department_id: account.department_id,
          block_id: account.block_id,
          year_level_id: account.year_level,
          email: account.email,
          role: account.role,
        },
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.resetPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const [user] = await pool.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);

    if (!user.length) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const [existingCode] = await pool.query(
      "SELECT reset_code FROM password_reset_codes WHERE email = ? AND used = false AND created_at >= NOW() - INTERVAL 15 MINUTE",
      [email]
    );

    let resetCode;
    if (existingCode.length) {
      resetCode = existingCode[0].reset_code;
    } else {
      resetCode = Math.floor(10000 + Math.random() * 90000);

      await pool.query(
        "DELETE FROM password_reset_codes WHERE email = ? AND created_at < NOW() - INTERVAL 15 MINUTE",
        [email]
      );

      await pool.query(
        "INSERT INTO password_reset_codes (email, reset_code, created_at, used) VALUES (?, ?, NOW(), false)",
        [email, resetCode]
      );
    }

    res
      .status(200)
      .json({ success: true, message: "Password reset request received." });

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
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.confirmPassword = async (req, res) => {
  const { email, reset_code } = req.body;

  try {
    if (!reset_code || !/^\d{5}$/.test(reset_code)) {
      return res.status(400).json({
        success: false,
        message: "Invalid reset code format. Must be a 5-digit number.",
      });
    }

    const [user] = await pool.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);
    if (!user.length) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const [codeRecord] = await pool.query(
      "SELECT * FROM password_reset_codes WHERE email = ? AND reset_code = ? AND created_at >= NOW() - INTERVAL 15 MINUTE AND used = false",
      [email, parseInt(reset_code, 10)]
    );

    if (!codeRecord.length) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired reset code." });
    }

    if (!codeRecord[0].used) {
      await pool.query(
        "UPDATE password_reset_codes SET used = true WHERE code_id = ?",
        [codeRecord[0].code_id]
      );
    }

    return res
      .status(200)
      .json({ success: true, message: "Reset code verified successfully." });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
