const { pool } = require("../config/db");
const bcrypt = require("bcrypt");

const handleError = (res, error, defaultMessage = "Internal server error") => {
  return res.status(error.status || 500).json({
    success: false,
    message: error.message || defaultMessage,
  });
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

exports.getAllUsers = async (req, res) => {
  try {
    const [users] = await pool.query("SELECT * FROM v_users");

    if (!users.length) {
      return res
        .status(404)
        .json({ success: false, message: "No users found" });
    }

    return res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    return handleError(res, error);
  }
};
