const { pool } = require("../config/db");
const config = require("../config/config");

exports.syncAttendance = async (req, res) => {
  try {
    const { attendanceData } = req.body;

    if (!Array.isArray(attendanceData)) {
      return res.status(400).json({
        message: "Invalid attendance data format. Expected an array.",
      });
    }

    const connection = await pool.getConnection();

    try {
      const syncedRecords = [];
      const failedRecords = [];

      for (const record of attendanceData) {
        const {
          event_date_id,
          student_id_number,
          am_in,
          am_out,
          pm_in,
          pm_out,
        } = record;

        if (!event_date_id || !student_id_number) {
          failedRecords.push({
            record,
            error:
              "Missing required fields: event_date_id and/or student_id_number.",
          });
          continue;
        }

        const numericEventDateId = parseInt(event_date_id);
        const numericStudentId = parseInt(student_id_number);

        if (isNaN(numericEventDateId) || isNaN(numericStudentId)) {
          failedRecords.push({
            record,
            error: "Invalid event_date_id or student_id_number.",
          });
          continue;
        }

        const columns = ["event_date_id", "student_id_number"];
        const values = [numericEventDateId, numericStudentId];
        const updates = [];

        if (am_in !== undefined && am_in !== null) {
          columns.push("am_in");
          values.push(true);
          updates.push(`am_in = VALUES(am_in)`);
        }
        if (am_out !== undefined && am_out !== null) {
          columns.push("am_out");
          values.push(true);
          updates.push(`am_out = VALUES(am_out)`);
        }
        if (pm_in !== undefined && pm_in !== null) {
          columns.push("pm_in");
          values.push(true);
          updates.push(`pm_in = VALUES(pm_in)`);
        }
        if (pm_out !== undefined && pm_out !== null) {
          columns.push("pm_out");
          values.push(true);
          updates.push(`pm_out = VALUES(pm_out)`);
        }

        const insertQuery = `
          INSERT INTO attendance (${columns.join(", ")})
          VALUES (${values.map(() => "?").join(", ")})
          ON DUPLICATE KEY UPDATE ${updates.join(", ")}
        `;

        try {
          await connection.query(insertQuery, values);
          syncedRecords.push({ event_date_id, student_id_number });
        } catch (dbError) {
          failedRecords.push({
            record,
            error: "Database error while syncing attendance.",
          });
        }
      }

      return res.status(200).json({
        success: true,
        message: "Attendance sync completed.",
        syncedRecords,
        failedRecords,
      });
    } catch (dbError) {
      console.error("Database error:", dbError);
      return res.status(500).json({
        message: "Database error while syncing attendance.",
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("An error occurred:", error);
    return res.status(500).json({
      message: "An error occurred while processing the data.",
    });
  }
};
