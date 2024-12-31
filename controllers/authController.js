const { Users } = require("../models");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const config = require("../config/config");

exports.signup = async (req, res) => {
  const { student_ID, firstName, middleName, lastName, email, password } =
    req.body;

  try {
    const existingUser = await Users.findOne({
      where: {
        student_ID,
        firstName,
        lastName,
        middleName,
      },
    });

    if (existingUser) {
      console.log("Existing user found, updating...");
      existingUser.email = email;
      existingUser.password = await bcrypt.hash(password, 10);
      await existingUser.save();

      return res.status(200).json({
        message: "User successfully updated.",
        user: existingUser,
      });
    }

    return res.status(400).json({
      message: "Student data does not match. User not updated.",
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

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: config.GMAIL_USER,
        pass: config.GMAIL_PASS,
      },
    });

    const resetContent = `Hello, \n\nPlease use the following code to reset your password: \n\n${resetCode}\n\nIf you did not request a password reset, please ignore this email.`;

    const info = await transporter.sendMail({
      from: '"Eventlog" <eventlogucv.noreply@gmail.com>',
      to: email,
      subject: "Password Reset Request",
      text: resetContent,
      html: `<b>Hello,</b><br><br>Please use the following code to reset your password: <b>${resetCode}</b><br><br>If you did not request a password reset, please ignore this email.`,
    });

    console.log("Message sent: %s", info.messageId);

    res.status(200).json({
      message:
        "Password reset email sent successfully. Please check your inbox.",
    });
  } catch (error) {
    console.error("Error occurred during password reset:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};
