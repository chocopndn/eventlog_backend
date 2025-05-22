const { pool } = require("../config/db");
const csv = require("csv-parser");
const fs = require("fs");

const updateStudents = async (filePath) => {
  const connection = await pool.getConnection();

  try {
    await connection.query("START TRANSACTION");

    const rows = [];
    const processedIdNumbers = new Set();

    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(
          csv({
            mapHeaders: ({ header }) => header.toLowerCase().replace(/ /g, "_"),
          })
        )
        .on("data", (row) => {
          if (row.id_number && row.id_number.trim() !== "") {
            rows.push(row);
            processedIdNumbers.add(row.id_number);
          }
        })
        .on("end", () => {
          resolve();
        })
        .on("error", (err) => {
          reject(err);
        });
    });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const {
        id_number,
        department,
        course,
        block,
        year_level,
        first_name,
        middle_name,
        last_name,
        suffix,
      } = row;

      const userQuery = "SELECT * FROM users WHERE id_number = ?";
      const userValues = [id_number];
      const [userResult] = await connection.query(userQuery, userValues);

      let blockId;
      const blockQuery = `
        SELECT id FROM blocks
        WHERE name = ? AND department_id = (
          SELECT id FROM departments WHERE code = ?
        ) AND course_id = (
          SELECT id FROM courses WHERE code = ?
        ) AND year_level_id = ? AND school_year_semester_id = (
          SELECT id FROM school_year_semesters WHERE status = 'Active'
        )
      `;
      const blockValues = [block, department, course, year_level];
      const [blockResult] = await connection.query(blockQuery, blockValues);

      if (blockResult.length === 0) {
        const departmentQuery = "SELECT id FROM departments WHERE code = ?";
        const departmentValues = [department];
        const [departmentResult] = await connection.query(
          departmentQuery,
          departmentValues
        );
        if (departmentResult.length === 0) continue;

        const courseQuery = "SELECT id FROM courses WHERE code = ?";
        const courseValues = [course];
        const [courseResult] = await connection.query(
          courseQuery,
          courseValues
        );
        if (courseResult.length === 0) continue;

        const insertBlockQuery = `
          INSERT INTO blocks (name, department_id, course_id, year_level_id, school_year_semester_id)
          VALUES (?, ?, ?, ?, (SELECT id FROM school_year_semesters WHERE status = 'Active'))
        `;
        const insertBlockValues = [
          block,
          departmentResult[0].id,
          courseResult[0].id,
          year_level,
        ];
        const [insertBlockResult] = await connection.query(
          insertBlockQuery,
          insertBlockValues
        );
        blockId = insertBlockResult.insertId;
      } else {
        blockId = blockResult[0].id;
      }

      if (userResult.length > 0) {
        const updateQuery = `
          UPDATE users
          SET block_id = ?,
              first_name = ?,
              middle_name = ?,
              last_name = ?,
              suffix = ?,
              status = CASE WHEN status != 'Unregistered' THEN 'Active' ELSE status END
          WHERE id_number = ?
        `;
        const updateValues = [
          blockId,
          first_name,
          middle_name || null,
          last_name,
          suffix || null,
          id_number,
        ];
        await connection.query(updateQuery, updateValues);
      } else {
        const insertQuery = `
          INSERT INTO users (id_number, block_id, first_name, middle_name, last_name, suffix, status)
          VALUES (?, ?, ?, ?, ?, ?, 'Unregistered')
        `;
        const insertValues = [
          id_number,
          blockId,
          first_name,
          middle_name || null,
          last_name,
          suffix || null,
        ];
        await connection.query(insertQuery, insertValues);
      }
    }

    const disableQuery = `
      UPDATE users
      SET status = 'Disabled'
      WHERE id_number NOT IN (?) AND status = 'Active'
    `;
    const disableValues = [Array.from(processedIdNumbers)];
    await connection.query(disableQuery, disableValues);

    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
};

async function changeSchoolYear(filePath) {
  const connection = await pool.getConnection();

  function normalizeBlockName(name) {
    return name.trim().toUpperCase().replace(/\s+/g, " ");
  }

  try {
    await connection.query("START TRANSACTION");

    const [currentSemesterResult] = await connection.query(
      `SELECT id, school_year, semester FROM school_year_semesters WHERE status = 'Active'`
    );
    if (currentSemesterResult.length === 0)
      throw new Error("No active semester found");

    const {
      id: currentSemesterId,
      school_year,
      semester,
    } = currentSemesterResult[0];

    await connection.query(
      `UPDATE school_year_semesters SET status = 'Archived' WHERE id = ?`,
      [currentSemesterId]
    );

    let newSchoolYear = school_year;
    let newSemester = "";
    if (semester === "1st Semester") newSemester = "2nd Semester";
    else if (semester === "2nd Semester") {
      const [yearStart, yearEnd] = school_year.split("-");
      newSchoolYear = `${yearEnd}-${Number(yearEnd) + 1}`;
      newSemester = "1st Semester";
    }

    const [insertNewSemester] = await connection.query(
      `INSERT INTO school_year_semesters (school_year, semester, status) VALUES (?, ?, 'Active')`,
      [newSchoolYear, newSemester]
    );
    const newSemesterId = insertNewSemester.insertId;

    await connection.query(
      `UPDATE blocks SET status = 'Archived' WHERE school_year_semester_id = ?`,
      [currentSemesterId]
    );

    const rows = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(
          csv({
            mapHeaders: ({ header }) => header.toLowerCase().replace(/ /g, "_"),
          })
        )
        .on("data", (row) => rows.push(row))
        .on("end", resolve)
        .on("error", reject);
    });

    const blockCache = new Map();

    for (const row of rows) {
      const departmentCode = row.department.trim();
      const courseCode = row.course.trim();
      const blockRaw = row.block;
      const blockName = normalizeBlockName(blockRaw);
      const yearLevelId = row.year_level.trim();

      const blockKey = `${departmentCode}-${courseCode}-${blockName}-${yearLevelId}`;

      let blockId = blockCache.get(blockKey);
      if (!blockId) {
        // Check if block exists in DB
        const [blockResult] = await connection.query(
          `SELECT b.id FROM blocks b
           JOIN departments d ON b.department_id = d.id
           JOIN courses c ON b.course_id = c.id
           WHERE d.code = ? AND c.code = ? AND b.name = ? AND b.year_level_id = ? AND b.school_year_semester_id = ? AND b.status = 'Active'
           LIMIT 1`,
          [departmentCode, courseCode, blockName, yearLevelId, newSemesterId]
        );

        if (blockResult.length > 0) {
          blockId = blockResult[0].id;
        } else {
          // Get department id
          const [deptResult] = await connection.query(
            "SELECT id FROM departments WHERE code = ? LIMIT 1",
            [departmentCode]
          );
          if (deptResult.length === 0) continue;
          const departmentId = deptResult[0].id;

          // Get course id
          const [courseResult] = await connection.query(
            "SELECT id FROM courses WHERE code = ? LIMIT 1",
            [courseCode]
          );
          if (courseResult.length === 0) continue;
          const courseId = courseResult[0].id;

          // Verify year level exists
          const [yearLevelResult] = await connection.query(
            "SELECT id FROM year_levels WHERE id = ? LIMIT 1",
            [yearLevelId]
          );
          if (yearLevelResult.length === 0) continue;

          // Insert new block
          const [insertBlockResult] = await connection.query(
            `INSERT INTO blocks (name, department_id, course_id, year_level_id, school_year_semester_id, status)
             VALUES (?, ?, ?, ?, ?, 'Active')`,
            [blockName, departmentId, courseId, yearLevelId, newSemesterId]
          );
          blockId = insertBlockResult.insertId;
        }
        blockCache.set(blockKey, blockId);
      }

      // Now insert or update user with this block
      const idNumber = row.id_number.trim();
      const firstName = (row.first_name || "").trim();
      const middleName = (row.middle_name || "").trim();
      const lastName = (row.last_name || "").trim();
      const suffix = (row.suffix || "").trim();

      const [userResult] = await connection.query(
        "SELECT id_number, status FROM users WHERE id_number = ? LIMIT 1",
        [idNumber]
      );

      if (userResult.length === 0) {
        await connection.query(
          `INSERT INTO users (id_number, first_name, middle_name, last_name, suffix, block_id, status)
           VALUES (?, ?, ?, ?, ?, ?, 'Unregistered')`,
          [idNumber, firstName, middleName, lastName, suffix, blockId]
        );
      } else {
        const userStatus = userResult[0].status;
        const updateQuery = `
          UPDATE users
          SET first_name = ?,
          middle_name = ?,
          last_name = ?,
          suffix = ?,
          block_id = ?
          WHERE id_number = ?
        `;
        const updateValues = [
          firstName,
          middleName,
          lastName,
          suffix,
          blockId,
          idNumber,
        ];
        await connection.query(updateQuery, updateValues);

        if (userStatus !== "Unregistered") {
          await connection.query(
            `UPDATE users SET status = 'Active' WHERE id_number = ?`,
            [idNumber]
          );
        }
      }
    }

    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
}

async function getCurrentSchoolYear(req, res) {
  const connection = await pool.getConnection();

  try {
    console.log(
      "[getCurrentSchoolYear] Fetching current active school year..."
    );

    const query = `
      SELECT 
        id,
        school_year,
        semester,
        status
      FROM school_year_semesters 
      WHERE status = 'Active'
      ORDER BY id DESC
      LIMIT 1
    `;

    const [result] = await connection.query(query);

    if (result.length === 0) {
      console.warn("[getCurrentSchoolYear] No active school year found");
      return res.status(404).json({
        success: false,
        message: "No active school year found",
      });
    }

    const currentSchoolYear = result[0];
    console.log(
      `[getCurrentSchoolYear] Current school year: ${currentSchoolYear.school_year} - ${currentSchoolYear.semester}`
    );

    return res.status(200).json({
      success: true,
      message: "Current school year retrieved successfully",
      data: {
        id: currentSchoolYear.id,
        school_year: currentSchoolYear.school_year,
        semester: currentSchoolYear.semester,
        status: currentSchoolYear.status,
      },
    });
  } catch (error) {
    console.error(
      "[getCurrentSchoolYear] Error fetching current school year:",
      error.message
    );
    return res.status(500).json({
      success: false,
      message: "Failed to fetch current school year",
      error: error.message,
    });
  } finally {
    connection.release();
  }
}

module.exports = {
  updateStudents,
  changeSchoolYear,
  getCurrentSchoolYear,
};
