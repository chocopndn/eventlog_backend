const { User, Code, Department } = require("../models");
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
    const department = await Department.findOne({ where: { department_id } });

    if (!department) {
      return res.status(400).json({ message: "Invalid department ID." });
    }

    const user = await User.findOne({
      where: {
        student_id,
        first_name,
        middle_name,
        last_name,
        suffix,
        department_id,
      },
    });

    if (!user) {
      return res.status(400).json({
        message: "Student data does not match. User not created.",
      });
    }

    if (user.password) {
      return res.status(400).json({
        message: "User already has an account. Please log in.",
      });
    }

    user.email = email;
    user.password = await bcrypt.hash(password, 10);
    await user.save();

    return res.status(200).json({
      message: "User account successfully created.",
      user,
    });
  } catch (error) {
    console.error("Error during signup:", error.message);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.login = async (req, res) => {
  const { student_id, password } = req.body;

  try {
    const user = await User.findOne({ where: { student_id } });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid password." });
    }

    const token = jwt.sign(
      { id: user.student_id, email: user.email },
      config.JWT_SECRET_KEY
    );

    return res.status(200).json({
      message: "Login successful.",
      token,
      user: {
        student_id: user.student_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.resetPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const resetCode = Math.floor(10000 + Math.random() * 90000);

    await Code.create({
      email: user.email,
      reset_code: resetCode,
      created_at: new Date(),
      used: false,
    });

    const transporter = nodemailer.createTransport({
      host: "smtp.zoho.com",
      port: 465,
      auth: {
        user: config.EMAIL_USER,
        pass: config.EMAIL_PASS,
      },
    });

    await transporter.verify();

    await transporter.sendMail({
      from: '"Eventlog" <eventlogucv@zohomail.com>',
      to: email,
      subject: "Password Reset Request",
      text: `Your password reset code is: ${resetCode}`,
      html: `<p>Your password reset code is: <b>${resetCode}</b></p>`,
    });

    return res.status(200).json({
      message: "Password reset email sent successfully.",
    });
  } catch (error) {
    console.error("Error during password reset:", error.message);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.verifyResetCode = async (req, res) => {
  const { email, reset_code } = req.body;

  try {
    if (!reset_code || isNaN(parseInt(reset_code))) {
      return res
        .status(400)
        .json({ message: "Invalid or missing reset code." });
    }

    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const codeRecord = await Code.findOne({
      where: { email, reset_code: parseInt(reset_code) },
    });

    if (!codeRecord) {
      return res.status(400).json({ message: "Invalid reset code." });
    }

    if (codeRecord.used) {
      return res.status(400).json({ message: "Reset code already used." });
    }

    const now = new Date();
    if (now - new Date(codeRecord.created_at) > 15 * 60 * 1000) {
      return res.status(400).json({ message: "Reset code has expired." });
    }

    await Code.update(
      { used: true },
      { where: { code_id: codeRecord.code_id } }
    );

    return res
      .status(200)
      .json({ message: "Reset code verified successfully." });
  } catch (error) {
    console.error("Error verifying reset code:", error.message);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};
