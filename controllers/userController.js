const { pool } = require("../config/db");
const bcrypt = require("bcrypt");

exports.changePassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email and new password are required.",
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

    const isSamePassword = await bcrypt.compare(newPassword, user[0].password);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: "New password cannot be the same as the old password.",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password = ? WHERE email = ?", [
      hashedPassword,
      email,
    ]);

    return res.status(200).json({
      success: true,
      message: "Password has been reset successfully.",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while resetting the password.",
    });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT 
        users.student_id, 
        users.first_name, 
        users.middle_name,
        users.last_name, 
        users.suffix,
        users.email, 
        users.role,
        year_level.year_level,
        block.block_name,
        department.department_name
      FROM users
      LEFT JOIN year_level ON users.yearlevel_id = year_level.yearlevel_id
      LEFT JOIN block ON users.block_id = block.block_id
      LEFT JOIN department ON users.department_id = department.department_id`
    );

    return res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Error while getting users.",
    });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const [user] = await pool.query(
      `SELECT 
        users.student_id, 
        users.first_name, 
        users.middle_name,
        users.last_name, 
        users.suffix,
        users.email, 
        users.role,
        year_level.year_level,
        block.block_name,
        department.department_name
      FROM users
      LEFT JOIN year_level ON users.yearlevel_id = year_level.yearlevel_id
      LEFT JOIN block ON users.block_id = block.block_id
      LEFT JOIN department ON users.department_id = department.department_id
      WHERE users.student_id = ?`,
      [id]
    );

    if (user.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    return res.status(200).json({
      success: true,
      user: user[0],
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Error while getting user.",
    });
  }
};

exports.getUsersByDepartment = async (req, res) => {
  try {
    const { department_id } = req.params;

    const [users] = await pool.query(
      `SELECT 
        users.student_id, 
        users.first_name, 
        users.middle_name,
        users.last_name, 
        users.suffix,
        users.email, 
        users.role,
        year_level.year_level,
        block.block_name,
        department.department_name
      FROM users
      LEFT JOIN year_level ON users.yearlevel_id = year_level.yearlevel_id
      LEFT JOIN block ON users.block_id = block.block_id
      LEFT JOIN department ON users.department_id = department.department_id
      WHERE users.department_id = ?`,
      [department_id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No users found in this department.",
      });
    }

    return res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Error while getting users by department.",
    });
  }
};

exports.getUsersByBlock = async (req, res) => {
  try {
    const { block_id } = req.params;

    const [users] = await pool.query(
      `SELECT 
        users.student_id, 
        users.first_name, 
        users.middle_name,
        users.last_name, 
        users.suffix,
        users.email, 
        users.role,
        year_level.year_level,
        block.block_name,
        department.department_name
      FROM users
      LEFT JOIN year_level ON users.yearlevel_id = year_level.yearlevel_id
      LEFT JOIN block ON users.block_id = block.block_id
      LEFT JOIN department ON users.department_id = department.department_id
      WHERE users.block_id = ?`,
      [block_id]
    );

    if (users.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No users found in this block." });
    }

    return res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Error while getting users by block.",
    });
  }
};

exports.getUsersByYearLevel = async (req, res) => {
  try {
    const { yearlevel_id } = req.params;

    const [users] = await pool.query(
      `SELECT 
        users.student_id, 
        users.first_name, 
        users.middle_name,
        users.last_name, 
        users.suffix,
        users.email, 
        users.role,
        year_level.year_level,
        block.block_name,
        department.department_name
      FROM users
      LEFT JOIN year_level ON users.yearlevel_id = year_level.yearlevel_id
      LEFT JOIN block ON users.block_id = block.block_id
      LEFT JOIN department ON users.department_id = department.department_id
      WHERE users.yearlevel_id = ?`,
      [yearlevel_id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No users found in this year level.",
      });
    }

    return res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Error while getting users by year level.",
    });
  }
};
