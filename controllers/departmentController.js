const { Department } = require("../models");

exports.getDepartment = async (req, res) => {
  try {
    const departments = await Department.findAll();

    if (departments.length > 0) {
      const sortedDepartments = departments
        .map(({ department_id, department_name }) => ({
          department_id,
          department_name,
        }))
        .sort((a, b) => a.department_id - b.department_id);

      return res.status(200).json({
        departments: sortedDepartments,
      });
    }

    return res.status(404).json({
      message: "No departments found",
    });
  } catch (error) {
    console.error("Error fetching departments:", error.message);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};
