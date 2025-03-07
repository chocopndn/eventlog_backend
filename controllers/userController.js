const { pool } = require("../config/db");
const bcrypt = require("bcrypt");

const handleError = (res, error, defaultMessage = "Internal server error") => {
  return res.status(error.status || 500).json({
    success: false,
    message: error.message || defaultMessage,
  });
};

const getUserQuery = () => {
  return `
    SELECT 
      users.id_number, 
      users.first_name, 
      users.middle_name,
      users.last_name, 
      users.suffix,
      users.email, 
      roles.name AS role_name,
      year_levels.name AS year_level_name,
      blocks.name AS block_name,
      departments.name AS department_name
    FROM users
    LEFT JOIN roles ON users.role_id = roles.id
    LEFT JOIN blocks ON users.block_id = blocks.id
    LEFT JOIN departments ON blocks.department_id = departments.id
    LEFT JOIN year_levels ON blocks.year_level_id = year_levels.id
  `;
};

exports.changePassword = async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    return res.status(400).json({
      success: false,
      message: "Email and new password are required.",
    });
  }

  let connection;
  try {
    connection = await pool.getConnection();

    const [account] = await connection.query(
      `SELECT password_hash, 'users' AS table_name FROM users WHERE email = ? 
       UNION 
       SELECT password_hash, 'admins' AS table_name FROM admins WHERE email = ?`,
      [email, email]
    );

    if (!account.length) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const { password_hash, table_name } = account[0];

    const isSamePassword = await bcrypt.compare(newPassword, password_hash);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: "New password cannot be the same as the old password.",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await connection.query(
      `UPDATE ${table_name} SET password_hash = ? WHERE email = ?`,
      [hashedPassword, email]
    );

    return res.status(200).json({
      success: true,
      message: "Password has been reset successfully.",
    });
  } catch (error) {
    return handleError(res, error);
  } finally {
    if (connection) connection.release();
  }
};
