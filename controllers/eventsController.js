const { pool } = require("../config/db");
const moment = require("moment");
const config = require("../config/config");
const CryptoJS = require("crypto-js");

exports.userUpcomingEvents = async (req, res) => {
  const { block_id } = req.body;

  if (!block_id) {
    return res
      .status(400)
      .json({ success: false, message: "Block ID is required" });
  }

  try {
    let query = `
      SELECT * 
      FROM view_upcoming_events 
      WHERE JSON_CONTAINS(block_ids, CAST(? AS CHAR)) 
        AND status = 'approved'
    `;
    let queryParams = [block_id];

    query += ` ORDER BY JSON_UNQUOTE(JSON_EXTRACT(event_dates, "$[0]"));`;

    const [events] = await pool.query(query, queryParams);

    return res.json({ success: true, events: events });
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
    dates: event_dates,
    description,
    block_ids,
    am_in,
    am_out,
    pm_in,
    pm_out,
    duration,
    admin_id_number: created_by,
  } = req.body;

  console.log("triggered");

  if (
    !event_name_id ||
    !venue ||
    !Array.isArray(event_dates) ||
    event_dates.length === 0 ||
    !Array.isArray(block_ids) ||
    block_ids.length === 0 ||
    !created_by
  ) {
    return res
      .status(400)
      .json({ message: "Missing or invalid required fields." });
  }

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();

    const [schoolYearSemester] = await db.query(
      `SELECT id FROM school_year_semesters WHERE status = 'Active' LIMIT 1`
    );

    if (!schoolYearSemester || schoolYearSemester.length === 0) {
      await db.rollback();
      return res
        .status(400)
        .json({ message: "No active school year semester found." });
    }
    const school_year_semester_id = schoolYearSemester[0].id;

    const [existingEventName] = await db.query(
      `SELECT id FROM event_names WHERE id = ?`,
      [event_name_id]
    );

    if (!existingEventName || existingEventName.length === 0) {
      await db.rollback();
      return res.status(400).json({ message: "Invalid event name ID." });
    }

    const [existingAdmin] = await db.query(
      `SELECT id_number FROM admins WHERE id_number = ?`,
      [created_by]
    );

    if (!existingAdmin || existingAdmin.length === 0) {
      await db.rollback();
      return res.status(400).json({ message: "Invalid admin ID." });
    }

    const uniqueDates = [...new Set(event_dates)].sort();
    const uniqueBlocks = [...new Set(block_ids)].map(String).sort();

    const [existingEventView] = await db.query(
      `SELECT event_name_id, venue, event_dates, block_ids_list
       FROM view_existing_events
       WHERE event_name_id = ?
         AND venue = ?
         AND event_status = 'Pending'`,
      [event_name_id, venue]
    );

    if (existingEventView && existingEventView.length > 0) {
      const isDuplicate = existingEventView.some((existing) => {
        const existingDates = existing.event_dates
          ? existing.event_dates.split(",").sort()
          : [];
        const existingBlocks = existing.block_ids_list
          ? existing.block_ids_list.split(",").sort()
          : [];

        const currentDatesMatch =
          JSON.stringify(uniqueDates) === JSON.stringify(existingDates);
        const currentBlocksMatch =
          JSON.stringify(uniqueBlocks) === JSON.stringify(existingBlocks);

        return currentDatesMatch && currentBlocksMatch;
      });

      if (isDuplicate) {
        await db.rollback();
        return res.status(409).json({
          message: "Event with the exact same details already exists.",
        });
      }
    }

    const [eventResult] = await db.query(
      `INSERT INTO events
        (event_name_id, school_year_semester_id, venue, description, scan_personnel, created_by, status)
        VALUES (?, ?, ?, ?, ?, ?, 'Pending')`,
      [
        event_name_id,
        school_year_semester_id,
        venue,
        description,
        "Year Level Representatives, Governor, or Year Level Advisers",
        created_by,
      ]
    );
    const eventId = eventResult.insertId;

    const dateValues = uniqueDates.map((event_date) => [
      eventId,
      event_date,
      am_in,
      am_out,
      pm_in,
      pm_out,
      duration,
    ]);

    await db.query(
      `INSERT INTO event_dates
        (event_id, event_date, am_in, am_out, pm_in, pm_out, duration)
        VALUES ?`,
      [dateValues]
    );

    const blockValues = uniqueBlocks.map((block_id) => [eventId, block_id]);
    await db.query(`INSERT INTO event_blocks (event_id, block_id) VALUES ?`, [
      blockValues,
    ]);

    await db.commit();

    return res.status(201).json({
      success: true,
      message: "Event created successfully",
      event_id: eventId,
    });
  } catch (error) {
    console.error("Error adding event:", error);

    await db.rollback();
    return res.status(500).json({
      message: "Failed to create event",
    });
  } finally {
    db.release();
  }
};

exports.editEvent = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { event_id, date, am_in, am_out, pm_in, pm_out, duration } = req.body;

    const [existingDates] = await connection.query(
      `SELECT id, event_date FROM event_dates WHERE event_id = ?`,
      [event_id]
    );

    if (existingDates.length === 0) {
      return res
        .status(404)
        .json({ message: "Event not found or no dates exist." });
    }

    const existingDateMap = new Map(
      existingDates.map((d) => [d.event_date.toISOString().split("T")[0], d.id])
    );

    for (let newDate of date) {
      if (existingDateMap.has(newDate)) {
        await connection.query(
          `UPDATE event_dates SET am_in = ?, am_out = ?, pm_in = ?, pm_out = ?, duration = ? WHERE id = ?`,
          [am_in, am_out, pm_in, pm_out, duration, existingDateMap.get(newDate)]
        );
      }
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
      "SELECT id, name, status FROM event_names ORDER BY name ASC"
    );

    return res.json({ success: true, eventNames });
  } catch (error) {
    console.error("Error fetching event names:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch event names." });
  }
};

exports.getEditableEvents = async (req, res) => {
  try {
    const db = await pool.getConnection();
    const searchQuery = req.query.search || "";

    const [events] = await db.query(
      `
      SELECT * FROM v_editable_events
      WHERE event_name LIKE ? OR venue LIKE ?
      ORDER BY status, all_dates
      `,
      [`%${searchQuery}%`, `%${searchQuery}%`]
    );

    const simpleEvents = events.map((event) => {
      let blockIds = [];
      if (event.block_ids) {
        try {
          blockIds = JSON.parse(event.block_ids.replace(/[\n\r\s]+/g, ""));
        } catch (e) {
          console.log("Couldn't parse block IDs:", event.block_ids);
        }
      }

      const blockNames = event.block_names ? event.block_names.split(", ") : [];
      const dates = event.all_dates ? event.all_dates.split(", ") : [];

      return {
        id: event.event_id,
        name: event.event_name,
        venue: event.venue,
        status: event.status,
        dates: dates,
        am_in: event.am_in,
        am_out: event.am_out,
        pm_in: event.pm_in,
        pm_out: event.pm_out,
        duration: event.duration,
        blocks: {
          ids: blockIds,
          names: blockNames,
        },
        created_by: event.created_by_name,
        approved_by: event.approved_by_name || "Not approved",
      };
    });

    res.json({
      success: true,
      events: simpleEvents,
    });

    db.release();
  } catch (error) {
    console.log("Error getting events:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get events",
    });
  }
};

exports.getEventById = async (req, res) => {
  const { id } = req.params;

  try {
    const [events] = await pool.query(
      `SELECT * FROM view_events WHERE event_id = ?`,
      [id]
    );

    if (events.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });
    }

    const event = events[0];

    return res.json({ success: true, event });
  } catch (error) {
    console.error("Error fetching event by ID:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateEventById = async (req, res) => {
  const { id } = req.params;
  const {
    event_name_id,
    venue,
    description,
    date,
    block_ids,
    am_in,
    am_out,
    pm_in,
    pm_out,
    duration,
    scan_personnel,
    admin_id_number,
  } = req.body;

  if (!event_name_id || !venue || !date || !block_ids?.length) {
    console.error("[Validation] Missing required fields for update:", {
      missing: {
        event_name_id: !event_name_id,
        venue: !venue,
        date: !date,
        blocks: !block_ids?.length,
      },
    });
    return res
      .status(400)
      .json({ message: "Missing required fields for update" });
  }

  const defaultScanPersonnel =
    "Year Level Representatives, Governor, or Year Level Adviser";
  const finalScanPersonnel = scan_personnel || defaultScanPersonnel;

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();

    const [eventUpdateResult] = await db.query(
      `UPDATE events SET event_name_id = ?, venue = ?, description = ?, scan_personnel = ? WHERE id = ?`,
      [event_name_id, venue, description, finalScanPersonnel, id]
    );

    if (eventUpdateResult.affectedRows === 0) {
      await db.rollback();
      return res.status(404).json({ message: `Event with ID ${id} not found` });
    }

    let datesArray = [];
    if (typeof date === "string") {
      datesArray = [date];
    } else if (Array.isArray(date)) {
      datesArray = date;
    } else {
      await db.rollback();
      return res.status(400).json({
        message: "Invalid date format. Expected a string or an array of dates.",
      });
    }

    await db.query(`DELETE FROM event_dates WHERE event_id = ?`, [id]);
    const dateValues = datesArray.map((d) => [
      id,
      d,
      am_in,
      am_out,
      pm_in,
      pm_out,
      duration,
    ]);
    await db.query(
      `INSERT INTO event_dates (event_id, event_date, am_in, am_out, pm_in, pm_out, duration) VALUES ?`,
      [dateValues]
    );

    await db.query(`DELETE FROM event_blocks WHERE event_id = ?`, [id]);
    const uniqueBlocks = [...new Set(block_ids)];
    const blockValues = uniqueBlocks.map((b) => [id, b]);
    await db.query(`INSERT INTO event_blocks (event_id, block_id) VALUES ?`, [
      blockValues,
    ]);

    await db.commit();
    return res.json({
      success: true,
      message: `Event with ID ${id} updated successfully`,
      event_id: id,
    });
  } catch (error) {
    await db.rollback();
    console.error("Error updating event:", error);
    return res.status(500).json({
      success: false,
      message: `Failed to update event with ID ${id}`,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    db.release();
  }
};

exports.getApprovedOngoingEvents = async (req, res) => {
  try {
    const [events] = await pool.query(
      "SELECT * FROM view_upcoming_events ORDER BY event_dates ASC"
    );

    return res.json({ success: true, events: events });
  } catch (error) {
    console.error("Error fetching approved ongoing events:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch events." });
  }
};

exports.getAllEvents = async (req, res) => {
  try {
    const [events] = await pool.query("SELECT * FROM view_events");

    if (!events.length) {
      return res
        .status(404)
        .json({ success: false, message: "No events found" });
    }

    return res.status(200).json({ success: true, events });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.deleteEventById = async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res
      .status(400)
      .json({ success: false, message: "Event ID is required" });
  }

  try {
    const [result] = await pool.query(
      `UPDATE events SET status = 'deleted' WHERE id = ?`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });
    }

    return res.json({
      success: true,
      message: "Event soft deleted successfully",
    });
  } catch (error) {
    console.error("Error soft deleting event:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to soft delete event" });
  }
};

exports.approveEventById = async (req, res) => {
  const { id } = req.params;
  const { admin_id_number } = req.body;

  if (!id || !admin_id_number) {
    return res.status(400).json({
      success: false,
      message: "Event ID and Admin ID are required",
    });
  }

  try {
    const [result] = await pool.query(
      `UPDATE events SET status = 'approved', approved_by = ? WHERE id = ?`,
      [admin_id_number, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    return res.json({
      success: true,
      message: "Event approved successfully",
    });
  } catch (error) {
    console.error("Error approving event:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to approve event",
    });
  }
};
