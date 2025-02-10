const { pool } = require("../config/db");

const handleError = (res, error, defaultMessage = "Internal server error") => {
  console.error(error);
  return res.status(error.status || 500).json({
    success: false,
    message: error.message || defaultMessage,
  });
};

exports.getDepartment = async (req, res) => {
  try {
    const [departments] = await pool.query(
      "SELECT id, name FROM departments ORDER BY id"
    );

    if (!departments.length) {
      return res
        .status(404)
        .json({ success: false, message: "No departments found" });
    }

    return res.status(200).json({ success: true, departments });
  } catch (error) {
    return handleError(res, error);
  }
};
