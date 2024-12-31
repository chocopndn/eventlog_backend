const { Users } = require("../models");
const bcrypt = require("bcrypt");

exports.signup = async (req, res) => {
  const { student_ID, firstName, middleName, lastName, email, password } =
    req.body;

  console.log("Processing signup request:", req.body);

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
