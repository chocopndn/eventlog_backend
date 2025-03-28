const { pool } = require("../config/db");

const handleError = (res, error, defaultMessage = "Internal server error") => {
  console.error(error);
  return res.status(error.status || 500).json({
    success: false,
    message: error.message || defaultMessage,
  });
};

exports.getAllAdmins = async (req, res) => {
  try {
    const searchQuery = req.query.search || "";

    const query = `
      SELECT * FROM v_admin_details 
      WHERE id_number LIKE ? 
         OR first_name LIKE ? 
         OR last_name LIKE ? 
         OR email LIKE ?
    `;

    const searchTerm = `%${searchQuery}%`;
    const [admins] = await pool.query(query, [
      searchTerm,
      searchTerm,
      searchTerm,
      searchTerm,
    ]);

    if (!admins.length) {
      return res
        .status(404)
        .json({ success: false, message: "No admins found" });
    }

    return res.status(200).json({ success: true, admins });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.deleteAdmin = async (req, res) => {
  try {
    const { id_number } = req.params;

    const [admin] = await pool.query(
      "SELECT * FROM admins WHERE id_number = ?",
      [id_number]
    );

    if (!admin.length) {
      return res
        .status(404)
        .json({ success: false, message: "Admin not found" });
    }

    await pool.query("DELETE FROM admins WHERE id_number = ?", [id_number]);

    return res.status(200).json({
      success: true,
      message: "Admin deleted successfully",
    });
  } catch (error) {
    return handleError(res, error);
  }
};
