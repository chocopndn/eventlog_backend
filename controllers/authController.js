const { Users, Codes, Department } = require("../models");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const config = require("../config/config");

exports.signup = async (req, res) => {
  const {
    student_ID,
    firstName,
    middleName,
    lastName,
    suffix = null,
    email,
    password,
    department,
  } = req.body;

  try {
    const departmentRecord = await Department.findOne({
      where: { id: department },
    });

    if (!departmentRecord) {
      return res.status(400).json({
        message: "Invalid department. Please provide a valid department ID.",
      });
    }

    const existingUser = await Users.findOne({
      where: {
        student_ID,
        firstName,
        middleName,
        lastName,
        suffix,
      },
    });

    if (existingUser) {
      if (existingUser.password) {
        return res.status(400).json({
          message: "User already has an account. Please log in.",
        });
      }

      existingUser.email = email;
      existingUser.password = await bcrypt.hash(password, 10);
      existingUser.department_id = department.department_;
      await existingUser.save();

      return res.status(200).json({
        message: "User account successfully completed.",
        user: existingUser,
      });
    }

    return res.status(400).json({
      message: "Student data does not match. User not created.",
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.login = async (req, res) => {
  const { student_ID, password } = req.body;

  try {
    const existingUser = await Users.findOne({
      where: { student_ID },
    });

    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      existingUser.password
    );

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid password" });
    }

    const token = jwt.sign(
      { id: existingUser.student_ID, email: existingUser.email },
      config.JWT_SECRET_KEY
    );

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        student_ID: existingUser.student_ID,
        firstName: existingUser.firstName,
        lastName: existingUser.lastName,
        email: existingUser.email,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.resetPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const existingUser = await Users.findOne({
      where: { email },
    });

    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const resetCode = Math.floor(10000 + Math.random() * 90000);

    await Codes.create({
      email: existingUser.email,
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
      logger: true,
      debug: true,
    });

    await transporter.verify();

    const resetContent = `Hello, \n\nPlease use the following code to reset your password: \n\n${resetCode}\n\nIf you did not request a password reset, please ignore this email.`;

    const info = await transporter.sendMail({
      from: '"Eventlog" <eventlogucv@zohomail.com>',
      to: email,
      subject: "Password Reset Request",
      text: resetContent,
      html: `<b>Hello,</b><br><br>Please use the following code to reset your password: <b>${resetCode}</b><br><br>If you did not request a password reset, please ignore this email.`,
    });

    res.status(200).json({
      message:
        "Password reset email sent successfully. Please check your inbox.",
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.verifyResetCode = async (req, res) => {
  const { email, resetCode } = req.body;

  try {
    const existingUser = await Users.findOne({
      where: { email },
    });

    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const resetCodeRecord = await Codes.findOne({
      where: { email, reset_code: parseInt(resetCode) },
    });

    if (!resetCodeRecord) {
      return res.status(400).json({ message: "Invalid reset code" });
    }

    if (resetCodeRecord.used) {
      return res.status(400).json({ message: "Reset code already used" });
    }

    const currentTime = new Date();
    if (currentTime - new Date(resetCodeRecord.created_at) > 15 * 60 * 1000) {
      return res.status(400).json({ message: "Reset code has expired" });
    }

    await Codes.update(
      { used: true },
      { where: { code_id: resetCodeRecord.code_id } }
    );

    res.status(200).json({ message: "Reset code verified." });
  } catch (error) {
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};
