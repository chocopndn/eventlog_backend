const { Users } = require("../models");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

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
