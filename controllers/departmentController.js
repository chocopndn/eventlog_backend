const { pool } = require("../config/db");

exports.getDepartment = async (req, res) => {
  try {
    const [departments] = await pool.query(
      "SELECT id AS department_id, name AS department_name FROM departments ORDER BY id"
    );

    if (!departments.length) {
      return res
        .status(404)
        .json({ success: false, message: "No departments found" });
    }

    return res.status(200).json({ success: true, departments });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};
