const { Department } = require("../models");

exports.getDepartment = async (req, res) => {
  try {
    const departments = await Department.findAll();

    if (departments && departments.length > 0) {
      const sortedDepartments = departments
        .map((dept) => ({
          department_ID: dept.department_ID,
          departmentName: dept.departmentName,
        }))
        .sort((a, b) => a.department_ID - b.department_ID);

      return res.status(200).json({
        departments: sortedDepartments,
      });
    } else {
      return res.status(404).json({
        message: "No departments found",
      });
    }
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};
