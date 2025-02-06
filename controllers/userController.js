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

    let connection = await pool.getConnection();

    const [user] = await connection.query(
      "SELECT password_hash FROM users WHERE email = ?",
      [email]
    );
    const [admin] = await connection.query(
      "SELECT password_hash FROM admins WHERE email = ?",
      [email]
    );

    let account = user.length ? user[0] : admin.length ? admin[0] : null;

    if (!account) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const isSamePassword = await bcrypt.compare(
      newPassword,
      account.password_hash
    );
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: "New password cannot be the same as the old password.",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    if (user.length) {
      await connection.query(
        "UPDATE users SET password_hash = ? WHERE email = ?",
        [hashedPassword, email]
      );
    } else {
      await connection.query(
        "UPDATE admins SET password_hash = ? WHERE email = ?",
        [hashedPassword, email]
      );
    }

    connection.release();

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
        users.id_number, 
        users.first_name, 
        users.middle_name,
        users.last_name, 
        users.suffix,
        users.email, 
        roles.name AS role,
        year_levels.name AS year_level,
        blocks.name AS block_name,
        departments.name AS department_name
      FROM users
      LEFT JOIN roles ON users.role_id = roles.id
      LEFT JOIN blocks ON users.block_id = blocks.id
      LEFT JOIN departments ON blocks.department_id = departments.id
      LEFT JOIN year_levels ON blocks.year_level_id = year_levels.id`
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
        users.id_number, 
        users.first_name, 
        users.middle_name,
        users.last_name, 
        users.suffix,
        users.email, 
        roles.name AS role,
        year_levels.name AS year_level,
        blocks.name AS block_name,
        departments.name AS department_name
      FROM users
      LEFT JOIN roles ON users.role_id = roles.id
      LEFT JOIN blocks ON users.block_id = blocks.id
      LEFT JOIN departments ON blocks.department_id = departments.id
      LEFT JOIN year_levels ON blocks.year_level_id = year_levels.id
      WHERE users.id_number = ?`,
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
        users.id_number, 
        users.first_name, 
        users.middle_name,
        users.last_name, 
        users.suffix,
        users.email, 
        roles.name AS role,
        year_levels.name AS year_level,
        blocks.name AS block_name,
        departments.name AS department_name
      FROM users
      LEFT JOIN roles ON users.role_id = roles.id
      LEFT JOIN blocks ON users.block_id = blocks.id
      LEFT JOIN departments ON blocks.department_id = departments.id
      LEFT JOIN year_levels ON blocks.year_level_id = year_levels.id
      WHERE departments.id = ?`,
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
        users.id_number, 
        users.first_name, 
        users.middle_name,
        users.last_name, 
        users.suffix,
        users.email, 
        roles.name AS role,
        year_levels.name AS year_level,
        blocks.name AS block_name,
        departments.name AS department_name
      FROM users
      LEFT JOIN roles ON users.role_id = roles.id
      LEFT JOIN blocks ON users.block_id = blocks.id
      LEFT JOIN departments ON blocks.department_id = departments.id
      LEFT JOIN year_levels ON blocks.year_level_id = year_levels.id
      WHERE blocks.id = ?`,
      [block_id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No users found in this block.",
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
