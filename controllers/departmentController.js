const { Department } = require("../models");

exports.getDepartment = async (req, res) => {
  try {
    const departments = await Department.findAll();

    if (departments && departments.length > 0) {
      const departmentNames = departments.map((dept) => dept.departmentName);

      return res.status(200).json({
        departments: departmentNames,
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
