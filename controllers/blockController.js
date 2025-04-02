const { pool } = require("../config/db");

exports.getAllBlocks = async (req, res) => {
  const { search } = req.query;
  let query = "SELECT * FROM view_blocks";

  if (search) {
    query += ` WHERE name LIKE ? OR course_name LIKE ? OR year_level_name LIKE ?`;
  }

  try {
    const [blocks] = await pool.query(query, [
      `%${search}%`,
      `%${search}%`,
      `%${search}%`,
    ]);

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
      "SELECT * FROM view_blocks WHERE department_id = ?",
      [departmentId]
    );

    res.status(200).json({
      success: true,
      data: blocks,
      message: "Blocks fetched successfully.",
    });
  } catch (error) {
    console.error("Error fetching blocks by department:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

exports.getBlockById = async (req, res) => {
  const { id } = req.params;

  const blockId = Number(id);
  if (!blockId || isNaN(blockId)) {
    console.error("Invalid block ID provided:", id);
    return res.status(400).json({
      success: false,
      message: "Block ID is required and must be a valid number.",
    });
  }

  try {
    const [blocks] = await pool.query(
      "SELECT * FROM view_blocks WHERE block_id = ?",
      [blockId]
    );

    if (!blocks.length) {
      console.error("No block found for ID:", blockId);
      return res.status(404).json({
        success: false,
        message: "Block not found.",
      });
    }

    res.status(200).json({
      success: true,
      data: blocks[0],
      message: "Block fetched successfully.",
    });
  } catch (error) {
    console.error("Error fetching block by ID:", error.message || error);
    res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

exports.addBlock = async (req, res) => {
  const { name, course_id, year_level_id, status = "active" } = req.body;

  if (!name || !course_id || !year_level_id) {
    return res.status(400).json({
      success: false,
      message: "Block name, course ID, and year level ID are required.",
    });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO blocks (name, course_id, year_level_id, status) VALUES (?, ?, ?, ?)",
      [name, course_id, year_level_id, status]
    );

    const [newBlock] = await pool.query(
      "SELECT * FROM view_blocks WHERE block_id = ?",
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      data: newBlock[0],
      message: "Block added successfully.",
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({
        success: false,
        message: "A block with this name already exists.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

exports.editBlock = async (req, res) => {
  const { id } = req.params;
  const { name, course_id, year_level_id, status } = req.body;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "Block ID is required.",
    });
  }

  if (!name && !course_id && !year_level_id && !status) {
    return res.status(400).json({
      success: false,
      message:
        "At least one field (name, course ID, year level ID, or status) must be provided.",
    });
  }

  try {
    const updates = [];
    const values = [];

    if (name) {
      updates.push("name = ?");
      values.push(name);
    }
    if (course_id) {
      updates.push("course_id = ?");
      values.push(course_id);
    }
    if (year_level_id) {
      updates.push("year_level_id = ?");
      values.push(year_level_id);
    }
    if (status) {
      updates.push("status = ?");
      values.push(status);
    }

    values.push(id);

    const query = `UPDATE blocks SET ${updates.join(", ")} WHERE id = ?`;
    const [result] = await pool.query(query, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Block not found.",
      });
    }

    const [updatedBlock] = await pool.query(
      "SELECT * FROM view_blocks WHERE block_id = ?",
      [id]
    );

    res.status(200).json({
      success: true,
      data: updatedBlock[0],
      message: "Block updated successfully.",
    });
  } catch (error) {
    console.error("Error editing block:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({
        success: false,
        message: "A block with this name already exists.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

exports.deleteBlock = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "Block ID is required.",
    });
  }

  try {
    const [result] = await pool.query(
      "UPDATE blocks SET status = 'deleted' WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Block not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Block soft deleted successfully.",
    });
  } catch (error) {
    console.error("Error soft deleting block:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};
