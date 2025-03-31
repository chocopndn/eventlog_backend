const { pool } = require("../config/db");

const handleError = (res, error, defaultMessage = "Internal server error") => {
  console.error(error);
  return res.status(error.status || 500).json({
    success: false,
    message: error.message || defaultMessage,
  });
};

exports.getAllCourses = async (req, res) => {
  try {
    const searchQuery = req.query.search || "";

    const query = `
      SELECT * FROM v_courses 
      WHERE course_name LIKE ? OR department_name LIKE ?
    `;

    const searchTerm = `%${searchQuery}%`;
    const [courses] = await pool.query(query, [searchTerm, searchTerm]);

    if (!courses.length) {
      return res
        .status(404)
        .json({ success: false, message: "No courses found" });
    }

    return res.status(200).json({ success: true, courses });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;

    const [course] = await pool.query("SELECT * FROM courses WHERE id = ?", [
      id,
    ]);

    if (!course.length) {
      return res
        .status(404)
        .json({ success: false, message: "Course not found" });
    }

    await pool.query("DELETE FROM courses WHERE id = ?", [id]);

    return res.status(200).json({
      success: true,
      message: "Course deleted successfully",
    });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.addCourse = async (req, res) => {
  const { course_name, department_id } = req.body;

  if (!course_name || !department_id) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: name and department_id",
    });
  }

  let connection;
  try {
    connection = await pool.getConnection();

    const [existingCourse] = await connection.query(
      "SELECT * FROM courses WHERE LOWER(name) = ?",
      [course_name.toLowerCase()]
    );

    if (existingCourse.length > 0) {
      return res.status(409).json({
        success: false,
        message: "A course with this name already exists",
      });
    }

    const query = `
        INSERT INTO courses (
          name, department_id
        ) VALUES (?, ?)
      `;

    await connection.query(query, [course_name, department_id]);

    return res.status(201).json({
      success: true,
      message: "Course added successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to add course",
      error: error.message,
    });
  } finally {
    if (connection) connection.release();
  }
};

exports.editCourse = async (req, res) => {
  const { id } = req.params;
  const { name, department_id } = req.body;

  let connection;
  try {
    connection = await pool.getConnection();

    const [existingCourse] = await connection.query(
      "SELECT * FROM courses WHERE id = ?",
      [id]
    );

    if (!existingCourse.length) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push("name = ?");
      params.push(name);
    }
    if (department_id !== undefined) {
      updates.push("department_id = ?");
      params.push(department_id);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields provided for update",
      });
    }

    params.push(id);

    const query = `
        UPDATE courses 
        SET ${updates.join(", ")} 
        WHERE id = ?
      `;

    await connection.query(query, params);

    return res.status(200).json({
      success: true,
      message: "Course updated successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update course",
      error: error.message,
    });
  } finally {
    if (connection) connection.release();
  }
};

exports.fetchCourseById = async (req, res) => {
  try {
    const { id } = req.params;

    const [course] = await pool.query(
      "SELECT * FROM v_courses WHERE course_id = ?",
      [id]
    );

    if (!course.length) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    return res.status(200).json({
      success: true,
      course: course[0],
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch course details",
      error: error.message,
    });
  }
};
