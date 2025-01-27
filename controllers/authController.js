// Import necessary modules and dependencies
const { User, Code, Department, Block, YearLevel } = require("../models");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const config = require("../config/config");

// Signup function to register a new user
exports.signup = async (req, res) => {
  const {
    student_id,
    first_name,
    middle_name,
    last_name,
    suffix = null, // Optional field, default is null
    email,
    password,
    department_id,
  } = req.body;

  try {
    // Check if the department exists
    const department = await Department.findOne({ where: { department_id } });
    if (!department) {
      return res.status(400).json({
        success: false,
        message: "Invalid department ID.",
      });
    }

    // Check if the user exists in the database
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
        success: false,
        message: "Student data does not match. User not created.",
      });
    }

    // Check if the user already has a password (account exists)
    if (user.password) {
      return res.status(400).json({
        success: false,
        message: "User already has an account. Please log in.",
      });
    }

    // Set the email and encrypt the password before saving
    user.email = email;
    user.password = await bcrypt.hash(password, 10);
    await user.save();

    return res.status(200).json({
      success: true,
      message: "User account successfully created.",
      user,
    });
  } catch (error) {
    // Catch any unexpected error
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Login function to authenticate user
exports.login = async (req, res) => {
  const { student_id, password } = req.body;

  try {
    // Find the user by their student ID
    const user = await User.findOne({ where: { student_id } });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    // Check if the password matches
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid password." });
    }

    // Generate a JWT token for the user
    const token = jwt.sign(
      { id: user.student_id, email: user.email },
      config.JWT_SECRET_KEY
    );

    return res.status(200).json({
      success: true,
      message: "Login successful.", // Login success message
      token,
      user: {
        student_id: user.student_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        block: user.block
          ? {
              id: user.block.block_id,
              name: user.block.name, // Include block details if present
              description: user.block.description,
            }
          : null, // If no block is assigned, return null
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error", // Error handling
      error: error.message,
    });
  }
};

// Forgot password function to send a reset code
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    // Check if the email exists in the database
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    // Generate a 5-digit reset code
    const resetCode = Math.floor(10000 + Math.random() * 90000);

    // Save the reset code in the database
    Code.create({
      email: user.email,
      reset_code: resetCode,
      created_at: new Date(),
      used: false,
    });

    res
      .status(200)
      .json({ success: true, message: "Password reset request received." });

    // Configure nodemailer to send the reset code
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
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Verify reset code function
exports.verifyResetCode = async (req, res) => {
  const { email, reset_code } = req.body;

  try {
    // Validate the reset code
    if (!reset_code || isNaN(parseInt(reset_code))) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or missing reset code." });
    }

    // Check if the user exists
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    // Look up the reset code in the database
    const codeRecord = await Code.findOne({
      where: { email, reset_code: parseInt(reset_code) },
    });

    if (!codeRecord) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid reset code." });
    }

    if (codeRecord.used) {
      return res
        .status(400)
        .json({ success: false, message: "Reset code already used." });
    }

    // Check if the reset code is expired
    const now = new Date();
    if (now - new Date(codeRecord.created_at) > 15 * 60 * 1000) {
      return res
        .status(400)
        .json({ success: false, message: "Reset code has expired." });
    }

    // Mark the reset code as used
    await Code.update(
      { used: true },
      { where: { code_id: codeRecord.code_id } }
    );

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
