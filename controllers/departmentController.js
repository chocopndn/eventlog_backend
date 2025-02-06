const { pool } = require("../config/db");

exports.getDepartment = async (req, res) => {
  try {
    const [departments] = await pool.query("SELECT * FROM departments");

    if (departments.length > 0) {
      const sortedDepartments = departments
        .map(({ id, name }) => ({ department_id: id, department_name: name }))
        .sort((a, b) => a.department_id - b.department_id);

      return res.status(200).json({
        success: true,
        departments: sortedDepartments,
      });
    }

    return res.status(404).json({
      success: false,
      message: "No departments found",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
