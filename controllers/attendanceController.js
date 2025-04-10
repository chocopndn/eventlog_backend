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
        const numericStudentId = student_id_number;

        if (isNaN(numericEventDateId)) {
          failedRecords.push({
            record,
            error: "Invalid event_date_id.",
          });
          continue;
        }

        const selectQuery = `
          SELECT id FROM attendance
          WHERE event_date_id = ? AND student_id_number = ?
        `;
        const [rows] = await connection.query(selectQuery, [
          numericEventDateId,
          numericStudentId,
        ]);

        if (rows.length > 0) {
          const updateQuery = `
            UPDATE attendance
            SET am_in = ?, am_out = ?, pm_in = ?, pm_out = ?
            WHERE event_date_id = ? AND student_id_number = ?
          `;
          await connection.query(updateQuery, [
            am_in || false,
            am_out || false,
            pm_in || false,
            pm_out || false,
            numericEventDateId,
            numericStudentId,
          ]);
          syncedRecords.push({
            id: rows[0].id,
            event_date_id,
            student_id_number,
          });
        } else {
          const insertQuery = `
            INSERT INTO attendance (event_date_id, student_id_number, am_in, am_out, pm_in, pm_out)
            VALUES (?, ?, ?, ?, ?, ?)
          `;
          const [result] = await connection.query(insertQuery, [
            numericEventDateId,
            numericStudentId,
            am_in || false,
            am_out || false,
            pm_in || false,
            pm_out || false,
          ]);
          syncedRecords.push({
            id: result.insertId,
            event_date_id,
            student_id_number,
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
