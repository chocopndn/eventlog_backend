const { pool } = require("../config/db");
const moment = require("moment");
const config = require("../config/config");
const CryptoJS = require("crypto-js");

exports.userUpcomingEvents = async (req, res) => {
  const { block_id } = req.body;

  try {
    let query = `SELECT * FROM v_user_upcoming_events`;
    let queryParams = [];

    if (block_id !== null && block_id !== undefined) {
      query += ` WHERE block_id = ? OR block_id IS NULL`;
      queryParams.push(block_id);
    }

    query += ` ORDER BY event_date;`;

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
    block_ids,
    date,
    am_in,
    am_out,
    pm_in,
    pm_out,
    duration,
    scan_personnel,
    admin_id_number,
  } = req.body;

  if (
    !event_name_id ||
    !venue ||
    !description ||
    !block_ids?.length ||
    !date?.length ||
    !duration ||
    !scan_personnel ||
    !admin_id_number
  ) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    let existingEventId = null;
    let isExistingEvent = false;

    for (const eventDate of date) {
      const [existingEvents] = await db.query(
        `SELECT e.id, e.description FROM events e
         JOIN event_dates ed ON e.id = ed.event_id
         JOIN event_blocks eb ON e.id = eb.event_id
         WHERE e.event_name_id = ? AND e.venue = ? AND ed.event_date = ? 
         AND ed.am_in <=> ? AND ed.am_out <=> ? AND ed.pm_in <=> ? AND ed.pm_out <=> ? AND ed.duration = ?
         AND eb.block_id IN (?)
         GROUP BY e.id, e.description
         HAVING COUNT(DISTINCT eb.block_id) = ?`,
        [
          event_name_id,
          venue,
          eventDate,
          am_in,
          am_out,
          pm_in,
          pm_out,
          duration,
          block_ids,
          new Set(block_ids).size,
        ]
      );

      if (existingEvents.length > 0) {
        existingEventId = existingEvents[0].id;
        isExistingEvent = true;
        if (existingEvents[0].description === description) {
          await db.rollback();
          return res
            .status(400)
            .json({ message: "Event already exists with the same details." });
        }
      }
    }

    if (isExistingEvent) {
      await db.query(
        `UPDATE events SET description = ?, created_by = ?, scan_personnel = ?, status = 'pending' WHERE id = ?`,
        [description, admin_id_number, scan_personnel, existingEventId]
      );
    } else {
      const [newEvent] = await db.query(
        `INSERT INTO events (event_name_id, venue, description, created_by, scan_personnel, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [event_name_id, venue, description, admin_id_number, scan_personnel]
      );
      existingEventId = newEvent.insertId;
    }

    await db.query(`DELETE FROM event_dates WHERE event_id = ?`, [
      existingEventId,
    ]);
    const eventDates = date.map((d) => [
      existingEventId,
      d,
      am_in,
      am_out,
      pm_in,
      pm_out,
      duration,
    ]);
    await db.query(
      `INSERT INTO event_dates (event_id, event_date, am_in, am_out, pm_in, pm_out, duration) VALUES ?`,
      [eventDates]
    );

    await db.query(`DELETE FROM event_blocks WHERE event_id = ?`, [
      existingEventId,
    ]);
    const eventBlocks = [...new Set(block_ids)].map((blockId) => [
      existingEventId,
      blockId,
    ]);
    await db.query(`INSERT INTO event_blocks (event_id, block_id) VALUES ?`, [
      eventBlocks,
    ]);

    await db.commit();
    res
      .status(201)
      .json({
        message: isExistingEvent
          ? "Event updated successfully."
          : "Event added successfully.",
      });
  } catch (error) {
    await db.rollback();
    res
      .status(500)
      .json({ message: "Failed to add/update event.", error: error.message });
  } finally {
    db.release();
  }
};

exports.editEvent = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { event_id, date, am_in, am_out, pm_in, pm_out, duration } = req.body;

    const [eventResult] = await connection.query(
      `SELECT id FROM events WHERE id = ?`,
      [event_id]
    );

    if (eventResult.length === 0) {
      return res.status(404).json({ message: "Event not found" });
    }

    await connection.query(`DELETE FROM event_dates WHERE event_id = ?`, [
      event_id,
    ]);

    for (let newDate of date) {
      await connection.query(
        `INSERT INTO event_dates (event_id, event_date, am_in, am_out, pm_in, pm_out, duration) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [event_id, newDate, am_in, am_out, pm_in, pm_out, duration]
      );
    }

    res.json({ message: "Event updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  } finally {
    connection.release();
  }
};

exports.getAllEventNames = async (req, res) => {
  try {
    const [eventNames] = await pool.query(
      "SELECT id, name FROM event_names ORDER BY name ASC"
    );

    return res.json({ success: true, eventNames });
  } catch (error) {
    console.error("Error fetching event names:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch event names." });
  }
};
