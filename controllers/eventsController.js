const { pool } = require("../config/db");
const moment = require("moment");
const config = require("../config/config");
const CryptoJS = require("crypto-js");

exports.userUpcomingEvents = async (req, res) => {
  const { block_id } = req.body;
  const currentDate = moment().format("YYYY-MM-DD");

  try {
    let query = `
      SELECT 
        events.id AS event_id,
        event_names.name AS event_name,
        events.venue,
        event_dates.event_date,
        event_dates.am_in,
        event_dates.am_out,
        event_dates.pm_in,
        event_dates.pm_out,
        events.scan_personnel
      FROM events
      JOIN event_names ON events.event_name_id = event_names.id
      JOIN event_dates ON events.id = event_dates.event_id
      LEFT JOIN event_blocks ON events.id = event_blocks.event_id
      WHERE event_dates.event_date >= ?
    `;

    query += ` AND event_blocks.event_id IS NOT NULL`;

    if (block_id !== null && block_id !== undefined) {
      query += ` AND (event_blocks.block_id = ? OR event_blocks.block_id IS NULL)`;
    }

    query += ` ORDER BY event_dates.event_date;`;

    const queryParams =
      block_id !== null && block_id !== undefined
        ? [currentDate, block_id]
        : [currentDate];
    const [events] = await pool.query(query, queryParams);

    if (!events.length) {
      return res.json({ success: true, events: [] });
    }

    const formattedEvents = events.reduce((acc, eventRecord) => {
      const event = acc.find((ev) => ev.event_id === eventRecord.event_id);

      if (!event) {
        acc.push({
          event_id: eventRecord.event_id,
          event_name: eventRecord.event_name,
          venue: eventRecord.venue,
          scan_personnel: eventRecord.scan_personnel,
          event_dates: [moment(eventRecord.event_date).format("YYYY-MM-DD")],
          am_in: eventRecord.am_in,
          am_out: eventRecord.am_out,
          pm_in: eventRecord.pm_in,
          pm_out: eventRecord.pm_out,
        });
      } else {
        event.event_dates.push(
          moment(eventRecord.event_date).format("YYYY-MM-DD")
        );
      }

      return acc;
    }, []);

    return res.json({ success: true, events: formattedEvents });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong" });
  }
};

exports.recordAttendance = async (req, res) => {
  try {
    const encryptedAttendanceData = req.body.encryptedData;

    if (!encryptedAttendanceData) {
      return res.status(400).json({ message: "No encrypted data provided" });
    }

    const decryptionPassword = config.QR_PASS;

    try {
      const decryptedBytes = CryptoJS.AES.decrypt(
        encryptedAttendanceData,
        decryptionPassword
      );
      const decryptedAttendanceString = decryptedBytes.toString(
        CryptoJS.enc.Utf8
      );

      if (!decryptedAttendanceString) {
        return res
          .status(400)
          .json({ message: "Decryption failed or invalid data." });
      }

      const attendanceDataParts = decryptedAttendanceString.split("-");

      if (attendanceDataParts.length !== 3) {
        return res
          .status(400)
          .json({
            message: "Invalid data format. Expected fullName-userId-eventId.",
          });
      }

      const [fullName, userId, eventId] = attendanceDataParts;
      const numericUserId = parseInt(userId);
      const numericEventId = parseInt(eventId);

      if (isNaN(numericUserId) || isNaN(numericEventId)) {
        return res.status(400).json({ message: "Invalid user or event ID." });
      }

      const connection = await pool.getConnection();

      try {
        const [eventDates] = await connection.query(
          "SELECT id, event_date, am_in, am_out, pm_in, pm_out FROM event_dates WHERE event_id = ?",
          [numericEventId]
        );

        if (eventDates.length === 0) {
          return res.status(404).json({ message: "Event dates not found." });
        }

        const currentDate = new Date();
        const currentDateString = currentDate.toLocaleDateString("en-CA", {
          timeZone: "Asia/Manila",
        });

        const eventDate = eventDates.find(
          (date) =>
            date.event_date.toLocaleDateString("en-CA", {
              timeZone: "Asia/Manila",
            }) === currentDateString
        );

        if (!eventDate) {
          return res
            .status(404)
            .json({ message: "Event date not found for today." });
        }

        const currentTime = new Date();
        const currentTimeString = currentTime.toLocaleTimeString("en-CA", {
          timeZone: "Asia/Manila",
          hour12: false,
        });

        const [existingAttendance] = await connection.query(
          "SELECT * FROM attendance WHERE event_date_id = ? AND student_id_number = ?",
          [eventDate.id, numericUserId]
        );

        const existingRecord = existingAttendance[0];

        if (
          existingAttendance.length > 0 &&
          existingRecord &&
          existingRecord.am_in &&
          existingRecord.am_out &&
          existingRecord.pm_in &&
          existingRecord.pm_out
        ) {
          return res
            .status(400)
            .json({ message: "All attendance for today is already recorded." });
        }

        const attendanceRecord = {
          am_in: eventDate.am_in,
          am_out: eventDate.am_out,
          pm_in: eventDate.pm_in,
          pm_out: eventDate.pm_out,
        };

        let attendanceType = null;

        const timeToMinutes = (timeString) => {
          const [hours, minutes] = timeString.split(":").map(Number);
          return hours * 60 + minutes;
        };

        const timeWindowCheck = (targetTime) => {
          if (!targetTime) return false;
          const currentTimeMinutes = timeToMinutes(currentTimeString);
          const targetTimeMinutes = timeToMinutes(targetTime);
          return (
            currentTimeMinutes >= targetTimeMinutes - 30 &&
            currentTimeMinutes <= targetTimeMinutes + 30
          );
        };

        if (
          attendanceRecord.am_in &&
          timeWindowCheck(attendanceRecord.am_in) &&
          (!existingRecord || !existingRecord.am_in)
        ) {
          attendanceType = "am_in";
        } else if (
          attendanceRecord.am_out &&
          timeWindowCheck(attendanceRecord.am_out) &&
          existingRecord?.am_in &&
          !existingRecord.am_out
        ) {
          attendanceType = "am_out";
        } else if (
          attendanceRecord.pm_in &&
          timeWindowCheck(attendanceRecord.pm_in) &&
          existingRecord?.am_out &&
          !existingRecord.pm_in
        ) {
          attendanceType = "pm_in";
        } else if (
          attendanceRecord.pm_out &&
          timeWindowCheck(attendanceRecord.pm_out) &&
          existingRecord?.pm_in &&
          !existingRecord.pm_out
        ) {
          attendanceType = "pm_out";
        } else {
          return res
            .status(400)
            .json({
              message:
                "Attendance time window not met or invalid attendance state.",
            });
        }

        await connection.query(
          `INSERT INTO attendance (event_date_id, student_id_number, ${attendanceType}) VALUES (?, ?, ?)`,
          [eventDate.id, numericUserId, currentTimeString]
        );

        return res.status(200).json({
          message: `${attendanceType.toUpperCase()} attendance recorded`,
          fullName,
          userId: numericUserId,
          eventId: numericEventId,
          time: currentTimeString,
        });
      } catch (dbError) {
        return res
          .status(500)
          .json({ message: "Database error while recording attendance." });
      } finally {
        connection.release();
      }
    } catch {
      return res
        .status(400)
        .json({ message: "Decryption failed or invalid data." });
    }
  } catch {
    return res
      .status(500)
      .json({ message: "An error occurred while processing the data" });
  }
};
