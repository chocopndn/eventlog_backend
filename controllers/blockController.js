const { pool } = require("../config/db");

exports.getAllBlocks = async (req, res) => {
  try {
    const [blocks] = await pool.query("SELECT * FROM v_blocks");
    res.status(200).json({
      success: true,
      data: blocks,
      message: "Blocks fetched successfully.",
    });
  } catch (error) {
    console.error("Error fetching blocks:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

exports.getBlocksByDepartment = async (req, res) => {
  const { departmentId } = req.params;

  if (!departmentId) {
    return res.status(400).json({
      success: false,
      message: "Department ID is required.",
    });
  }

  try {
    const [blocks] = await pool.query(
      "SELECT * FROM blocks WHERE department_id = ?",
      [departmentId]
    );

    res.status(200).json({
      success: true,
      data: blocks,
      message: "Blocks fetched successfully.",
    });
  } catch (error) {
    console.error("Error fetching blocks:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};
