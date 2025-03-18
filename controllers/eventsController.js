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
        return res.status(400).json({
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
          "SELECT id, event_date, am_in, am_out, pm_in, pm_out, duration FROM event_dates WHERE event_id = ?",
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

        const timeToMinutes = (timeString) => {
          if (!timeString) return null;
          const [hours, minutes] = timeString.split(":").map(Number);
          return hours * 60 + minutes;
        };

        const currentTimeMinutes = timeToMinutes(currentTimeString);
        const amInMinutes = timeToMinutes(eventDate.am_in);
        const amOutMinutes = timeToMinutes(eventDate.am_out);
        const pmInMinutes = timeToMinutes(eventDate.pm_in);
        const pmOutMinutes = timeToMinutes(eventDate.pm_out);
        const durationMinutes = eventDate.duration;

        let attendanceType = null;

        if (
          currentTimeMinutes >= amInMinutes - 15 &&
          currentTimeMinutes <= amInMinutes + durationMinutes
        ) {
          attendanceType = "am_in";
        } else if (currentTimeMinutes <= amOutMinutes + durationMinutes) {
          attendanceType = "am_out";
        } else if (
          currentTimeMinutes >= pmInMinutes - 15 &&
          currentTimeMinutes <= pmInMinutes + durationMinutes
        ) {
          attendanceType = "pm_in";
        } else if (
          currentTimeMinutes >= pmOutMinutes - 15 &&
          currentTimeMinutes <= pmOutMinutes + durationMinutes
        ) {
          attendanceType = "pm_out";
        } else {
          return res
            .status(400)
            .json({ message: "Attendance time window not met." });
        }

        await connection.query(
          `INSERT INTO attendance (event_date_id, student_id_number, ${attendanceType}) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE ${attendanceType} = ?`,
          [eventDate.id, numericUserId, currentTimeString, currentTimeString]
        );

        return res.status(200).json({
          message: `${attendanceType.toUpperCase()} attendance recorded`,
          fullName,
          userId: numericUserId,
          eventId: numericEventId,
          time: currentTimeString,
        });
      } catch (dbError) {
        console.error("Database error:", dbError);
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
  } catch (error) {
    console.error("An error occurred:", error);
    return res
      .status(500)
      .json({ message: "An error occurred while processing the data" });
  }
};

exports.addEvent = async (req, res) => {
  const {
    event_name_id,
    venue,
    description,
    department_id,
    block_ids,
    date,
    am_in,
    am_out,
    pm_in,
    pm_out,
    duration,
    admin_id_number,
  } = req.body;

  if (
    !event_name_id ||
    !venue ||
    !description ||
    !department_id ||
    !block_ids ||
    !block_ids.length ||
    !date ||
    !duration ||
    !admin_id_number
  ) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [adminResult] = await connection.query(
      `SELECT first_name, middle_name, last_name, suffix 
       FROM admins 
       WHERE id_number = ?`,
      [admin_id_number]
    );

    if (adminResult.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Admin not found." });
    }

    const { first_name, middle_name, last_name, suffix } = adminResult[0];

    const scan_personnel = [first_name, middle_name, last_name, suffix]
      .filter(Boolean)
      .join(" ");

    const [eventResult] = await connection.query(
      `INSERT INTO events (event_name_id, venue, description, created_by, scan_personnel, status) 
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [event_name_id, venue, description, admin_id_number, scan_personnel]
    );

    const event_id = eventResult.insertId;

    await connection.query(
      `INSERT INTO event_dates (event_id, event_date, am_in, am_out, pm_in, pm_out, duration) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [event_id, date, am_in, am_out, pm_in, pm_out, duration]
    );

    const eventBlockValues = block_ids.map((block_id) => [event_id, block_id]);
    await connection.query(
      `INSERT INTO event_blocks (event_id, block_id) VALUES ?`,
      [eventBlockValues]
    );

    await connection.commit();
    return res.status(201).json({ message: "Event added successfully." });
  } catch (error) {
    await connection.rollback();
    console.error("Database error:", error);
    return res.status(500).json({ message: "Failed to add event." });
  } finally {
    connection.release();
  }
};

exports.editEvent = async (req, res) => {
  const {
    event_id,
    event_name_id,
    venue,
    description,
    department_id,
    block_ids,
    date,
    am_in,
    am_out,
    pm_in,
    pm_out,
    duration,
  } = req.body;

  if (
    !event_id ||
    !event_name_id ||
    !venue ||
    !description ||
    !department_id ||
    !Array.isArray(block_ids) ||
    !date ||
    !duration
  ) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [existingEvent] = await connection.query(
      `SELECT event_name_id, venue, description FROM events WHERE id = ?`,
      [event_id]
    );

    if (existingEvent.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Event not found." });
    }

    if (
      existingEvent[0].event_name_id !== event_name_id ||
      existingEvent[0].venue !== venue ||
      existingEvent[0].description !== description
    ) {
      await connection.query(
        `UPDATE events SET event_name_id = ?, venue = ?, description = ? WHERE id = ?`,
        [event_name_id, venue, description, event_id]
      );
    }

    const [existingEventDate] = await connection.query(
      `SELECT id FROM event_dates WHERE event_id = ? AND event_date = ?`,
      [event_id, date]
    );

    if (existingEventDate.length > 0) {
      await connection.query(
        `UPDATE event_dates 
         SET am_in = ?, am_out = ?, pm_in = ?, pm_out = ?, duration = ? 
         WHERE id = ?`,
        [am_in, am_out, pm_in, pm_out, duration, existingEventDate[0].id]
      );
    }

    const [existingBlocks] = await connection.query(
      `SELECT block_id FROM event_blocks WHERE event_id = ?`,
      [event_id]
    );

    const existingBlockIds = existingBlocks.map((b) => b.block_id);
    const hasNullBlock = existingBlockIds.includes(null);

    if (block_ids.length === 0) {
      await connection.query(`DELETE FROM event_blocks WHERE event_id = ?`, [
        event_id,
      ]);
      await connection.query(
        `INSERT INTO event_blocks (event_id, block_id) VALUES (?, NULL)`,
        [event_id]
      );
    } else {
      const blocksToAdd = block_ids.filter(
        (id) => !existingBlockIds.includes(id)
      );
      const blocksToRemove = existingBlockIds.filter(
        (id) => id !== null && !block_ids.includes(id)
      );

      if (blocksToRemove.length > 0) {
        await connection.query(
          `DELETE FROM event_blocks WHERE event_id = ? AND block_id IN (?)`,
          [event_id, blocksToRemove]
        );
      }

      if (hasNullBlock) {
        await connection.query(
          `DELETE FROM event_blocks WHERE event_id = ? AND block_id IS NULL`,
          [event_id]
        );
      }

      if (blocksToAdd.length > 0) {
        const blockInsertValues = blocksToAdd.map((blockId) => [
          event_id,
          blockId,
        ]);
        await connection.query(
          `INSERT INTO event_blocks (event_id, block_id) VALUES ?`,
          [blockInsertValues]
        );
      }
    }

    await connection.commit();
    res.status(200).json({ message: "Event updated successfully." });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ message: "Internal server error", error });
  } finally {
    connection.release();
  }
};
