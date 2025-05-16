const { pool } = require("../config/db");
const config = require("../config/config");
const moment = require("moment");

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

exports.fetchUserOngoingEvents = async (req, res) => {
  try {
    const { id_number, page = 1, limit = 10, search = "" } = req.body;

    if (!id_number) {
      return res.status(400).json({
        message: "Missing required parameter: id_number.",
      });
    }

    const connection = await pool.getConnection();

    try {
      const today = moment().format("YYYY-MM-DD");

      const userQuery = `
        SELECT block_id 
        FROM users 
        WHERE id_number = ?
      `;
      const [userRows] = await connection.query(userQuery, [id_number]);

      if (userRows.length === 0) {
        return res.status(404).json({
          message: "User not found.",
        });
      }

      const block_id = userRows[0].block_id;

      const offset = (page - 1) * limit;

      let baseQuery = `
        SELECT 
          event_id,
          event_name,
          event_dates,
          event_date_ids
        FROM 
          view_events
        WHERE 
          FIND_IN_SET(?, block_ids) > 0
          AND status = 'Approved'
      `;

      if (search.trim() !== "") {
        baseQuery += ` AND event_name LIKE ?`;
      }

      baseQuery += ` ORDER BY SUBSTRING_INDEX(event_dates, ',', 1) ASC`;

      const paginatedQuery = `${baseQuery} LIMIT ? OFFSET ?`;

      const queryParams = [block_id];
      if (search.trim() !== "") {
        queryParams.push(`%${search}%`);
      }
      queryParams.push(limit, offset);

      const [rows] = await connection.query(paginatedQuery, queryParams);

      const filteredRows = rows.filter((row) => {
        const eventDates = row.event_dates.split(",");
        const firstDate = eventDates[0];
        const lastDate = eventDates[eventDates.length - 1];

        return today >= firstDate && today <= lastDate;
      });

      const formattedRows = await Promise.all(
        filteredRows.map(async (row) => {
          const eventDates = row.event_dates.split(",");
          const eventDateIds = row.event_date_ids.split(",").map(Number);

          const attendanceQuery = `
            SELECT 
              event_date_id,
              am_in,
              am_out,
              pm_in,
              pm_out
            FROM 
              attendance
            WHERE 
              student_id_number = ? AND FIND_IN_SET(event_date_id, ?) > 0
          `;
          const [attendanceRows] = await connection.query(attendanceQuery, [
            id_number,
            eventDateIds.join(","),
          ]);

          const attendanceMap = {};
          attendanceRows.forEach((record) => {
            const dateIndex = eventDateIds.indexOf(record.event_date_id);
            const date = eventDates[dateIndex];
            attendanceMap[date] = {
              am_in: record.am_in === 1,
              am_out: record.am_out === 1,
              pm_in: record.pm_in === 1,
              pm_out: record.pm_out === 1,
            };
          });

          eventDates.forEach((date) => {
            if (!attendanceMap[date]) {
              attendanceMap[date] = {
                am_in: false,
                am_out: false,
                pm_in: false,
                pm_out: false,
              };
            }
          });

          return {
            event_id: row.event_id,
            event_name: row.event_name,
            attendance: [attendanceMap],
          };
        })
      );

      let countQuery = `
        SELECT COUNT(*) AS total
        FROM view_events
        WHERE FIND_IN_SET(?, block_ids) > 0
          AND status = 'Approved'
      `;

      if (search.trim() !== "") {
        countQuery += ` AND event_name LIKE ?`;
      }

      const countParams = [block_id];
      if (search.trim() !== "") {
        countParams.push(`%${search}%`);
      }

      const [countRows] = await connection.query(countQuery, countParams);
      const totalRecords = countRows[0].total;

      return res.status(200).json({
        success: true,
        message: "Events fetched successfully.",
        pagination: {
          page,
          limit,
          totalRecords,
          totalPages: Math.ceil(totalRecords / limit),
        },
        events: formattedRows,
      });
    } catch (dbError) {
      return res.status(500).json({
        message: "Database error while fetching user events.",
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    return res.status(500).json({
      message: "An error occurred while processing the request.",
    });
  }
};

exports.fetchUserPastEvents = async (req, res) => {
  try {
    const { id_number, page = 1, limit = 10 } = req.body;

    if (!id_number) {
      return res.status(400).json({
        message: "Missing required parameter: id_number.",
      });
    }

    const connection = await pool.getConnection();

    try {
      const userQuery = `
        SELECT block_id 
        FROM users 
        WHERE id_number = ?
      `;
      const [userRows] = await connection.query(userQuery, [id_number]);

      if (userRows.length === 0) {
        return res.status(404).json({
          message: "User not found.",
        });
      }

      const block_id = userRows[0].block_id;
      const offset = (page - 1) * limit;

      const baseQuery = `
        SELECT 
          event_id,
          event_name,
          event_dates,
          event_date_ids
        FROM 
          view_events
        WHERE 
          FIND_IN_SET(?, block_ids) > 0
          AND status = 'Archived' 
        ORDER BY 
          SUBSTRING_INDEX(event_dates, ',', 1) ASC 
      `;

      const paginatedQuery = `${baseQuery} LIMIT ? OFFSET ?`;
      const [rows] = await connection.query(paginatedQuery, [
        block_id,
        limit,
        offset,
      ]);

      const formattedRows = await Promise.all(
        rows.map(async (row) => {
          const eventDates = row.event_dates.split(",");
          const eventDateIds = row.event_date_ids.split(",").map(Number);

          const attendanceQuery = `
            SELECT 
              event_date_id,
              am_in,
              am_out,
              pm_in,
              pm_out
            FROM 
              attendance
            WHERE 
              student_id_number = ? AND FIND_IN_SET(event_date_id, ?) > 0
          `;
          const [attendanceRows] = await connection.query(attendanceQuery, [
            id_number,
            eventDateIds.join(","),
          ]);

          const attendanceMap = {};
          attendanceRows.forEach((record) => {
            const dateIndex = eventDateIds.indexOf(record.event_date_id);
            const date = eventDates[dateIndex];
            attendanceMap[date] = {
              am_in: record.am_in === 1,
              am_out: record.am_out === 1,
              pm_in: record.pm_in === 1,
              pm_out: record.pm_out === 1,
            };
          });

          eventDates.forEach((date) => {
            if (!attendanceMap[date]) {
              attendanceMap[date] = {
                am_in: false,
                am_out: false,
                pm_in: false,
                pm_out: false,
              };
            }
          });

          return {
            event_id: row.event_id,
            event_name: row.event_name,
            attendance: [attendanceMap],
          };
        })
      );

      const countQuery = `
        SELECT COUNT(*) AS total
        FROM view_events
        WHERE FIND_IN_SET(?, block_ids) > 0
          AND status = 'Archived'
      `;
      const [countRows] = await connection.query(countQuery, [block_id]);
      const totalRecords = countRows[0].total;

      return res.status(200).json({
        success: true,
        message: "Events fetched successfully.",
        pagination: {
          page,
          limit,
          totalRecords,
          totalPages: Math.ceil(totalRecords / limit),
        },
        events: formattedRows,
      });
    } catch (dbError) {
      return res.status(500).json({
        message: "Database error while fetching user events.",
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    return res.status(500).json({
      message: "An error occurred while processing the request.",
    });
  }
};

exports.fetchAllPastEvents = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.body;

    const connection = await pool.getConnection();

    try {
      const offset = (page - 1) * limit;

      const baseQuery = `
        SELECT 
          event_id,
          event_name,
          event_dates
        FROM 
          view_events
        WHERE 
          status = 'Archived'
        ORDER BY 
          SUBSTRING_INDEX(event_dates, ',', 1) ASC
      `;

      const paginatedQuery = `${baseQuery} LIMIT ? OFFSET ?`;
      const [rows] = await connection.query(paginatedQuery, [limit, offset]);

      const countQuery = `
        SELECT COUNT(*) AS total
        FROM view_events
        WHERE status = 'Archived'
      `;
      const [countRows] = await connection.query(countQuery);
      const totalRecords = countRows[0].total;

      return res.status(200).json({
        success: true,
        message: "All past events fetched successfully.",
        pagination: {
          page,
          limit,
          totalRecords,
          totalPages: Math.ceil(totalRecords / limit),
        },
        events: rows,
      });
    } catch (dbError) {
      return res.status(500).json({
        message: "Database error while fetching all past events.",
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    return res.status(500).json({
      message: "An error occurred while processing the request.",
    });
  }
};

exports.fetchAllOngoingEvents = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.body;

    const connection = await pool.getConnection();

    try {
      const offset = (page - 1) * limit;

      let baseQuery = `
        SELECT 
          event_id,
          event_name,
          event_dates
        FROM 
          view_events
        WHERE 
          status = 'Approved'
      `;

      if (search.trim() !== "") {
        baseQuery += ` AND event_name LIKE ?`;
      }

      baseQuery += ` ORDER BY SUBSTRING_INDEX(event_dates, ',', 1) ASC`;

      const paginatedQuery = `${baseQuery} LIMIT ? OFFSET ?`;

      const queryParams = [];
      if (search.trim() !== "") {
        queryParams.push(`%${search}%`);
      }
      queryParams.push(limit, offset);

      const [rows] = await connection.query(paginatedQuery, queryParams);

      let countQuery = `
        SELECT COUNT(*) AS total
        FROM view_events
        WHERE status = 'Approved'
      `;

      if (search.trim() !== "") {
        countQuery += ` AND event_name LIKE ?`;
      }

      const countParams = [];
      if (search.trim() !== "") {
        countParams.push(`%${search}%`);
      }

      const [countRows] = await connection.query(countQuery, countParams);
      const totalRecords = countRows[0].total;

      return res.status(200).json({
        success: true,
        message: "All ongoing events fetched successfully.",
        pagination: {
          page,
          limit,
          totalRecords,
          totalPages: Math.ceil(totalRecords / limit),
        },
        events: rows,
      });
    } catch (dbError) {
      return res.status(500).json({
        message: "Database error while fetching all ongoing events.",
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    return res.status(500).json({
      message: "An error occurred while processing the request.",
    });
  }
};

exports.fetchBlocksOfEvents = async (req, res) => {
  try {
    const { event_id, department_id, year_level_id, search_query } = req.body;

    if (!event_id) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameter: event_id.",
      });
    }

    const connection = await pool.getConnection();
    try {
      let query = `
        SELECT 
          event_blocks.event_id,
          events.event_name_id,
          event_names.name AS event_title,
          blocks.id AS block_id,
          blocks.name AS block_name,
          courses.id AS course_id,
          courses.code AS course_code,           
          blocks.department_id,
          blocks.year_level_id
        FROM event_blocks
        JOIN blocks ON event_blocks.block_id = blocks.id
        JOIN events ON event_blocks.event_id = events.id
        JOIN event_names ON events.event_name_id = event_names.id
        JOIN courses ON blocks.course_id = courses.id  
        WHERE events.status IN ('Approved', 'Archived')
          AND event_blocks.event_id = ?
          AND EXISTS (
            SELECT 1
            FROM users
            WHERE users.block_id = blocks.id
              AND users.status != 'Disabled'
          )
      `;

      const params = [event_id];

      if (department_id) {
        query += ` AND blocks.department_id = ?`;
        params.push(department_id);
      }

      if (year_level_id) {
        query += ` AND blocks.year_level_id = ?`;
        params.push(year_level_id);
      }

      if (
        search_query &&
        typeof search_query === "string" &&
        search_query.trim() !== ""
      ) {
        const likeQuery = `%${search_query.trim()}%`;
        query += ` AND (blocks.name LIKE ? OR courses.code LIKE ?)`;
        params.push(likeQuery, likeQuery);
      }

      const [rows] = await connection.query(query, params);

      if (rows.length === 0) {
        return res.status(200).json({
          success: true,
          message: "No matching data found.",
          data: {
            event_id: event_id,
            event_title: "Event Blocks",
            blocks: [],
          },
        });
      }

      const event_title = rows[0].event_title;

      const blocks = rows.map((row) => ({
        block_id: row.block_id,
        block_name: row.block_name,
        course_code: row.course_code,
        department_id: row.department_id,
        year_level_id: row.year_level_id,
      }));

      const result = {
        success: true,
        message: "Event block data retrieved successfully.",
        data: {
          event_id: event_id,
          event_title: event_title,
          blocks: blocks,
        },
      };

      return res.status(200).json(result);
    } catch (dbError) {
      return res.status(500).json({
        success: false,
        message: "Database error while fetching event block details.",
        error: dbError.message,
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "An error occurred while processing the request.",
      error: error.message,
    });
  }
};

exports.fetchStudentAttendanceByEventAndBlock = async (req, res) => {
  try {
    const { event_id, block_id, search_query, page = 1, limit = 10 } = req.body;

    if (!event_id || !block_id) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required parameters: event_id and block_id are required.",
      });
    }

    const connection = await pool.getConnection();
    try {
      const [eventBlockCheck] = await connection.query(
        `SELECT * FROM event_blocks WHERE event_id = ? AND block_id = ?`,
        [event_id, block_id]
      );

      if (eventBlockCheck.length === 0) {
        return res.status(404).json({
          success: false,
          message: "The specified block is not associated with the event.",
        });
      }

      const [studentsInBlock] = await connection.query(
        `SELECT COUNT(*) AS count FROM users WHERE block_id = ? AND status != 'Disabled'`,
        [block_id]
      );

      if (studentsInBlock[0].count === 0) {
        const [eventDetails] = await connection.query(
          `SELECT en.name AS event_name
           FROM events e
           JOIN event_names en ON e.event_name_id = en.id
           WHERE e.id = ?`,
          [event_id]
        );

        const [blockDetails] = await connection.query(
          `SELECT b.name AS block_name
           FROM blocks b
           WHERE b.id = ?`,
          [block_id]
        );

        return res.status(200).json({
          success: true,
          message: "No students found for the specified block.",
          data: {
            event_id: Number(event_id),
            event_name:
              eventDetails.length > 0
                ? eventDetails[0].event_name
                : "Unknown Event",
            block_id: Number(block_id),
            block_name:
              blockDetails.length > 0
                ? blockDetails[0].block_name
                : "Unknown Block",
            students: [],
            pagination: {
              total: 0,
              page: 1,
              limit: Number(limit),
              total_pages: 0,
            },
          },
        });
      }

      let query = `
        SELECT 
          u.id_number AS student_id,
          u.first_name,
          u.middle_name,
          u.last_name,
          u.suffix,
          u.email,
          u.status AS user_status,
          b.id AS block_id,
          b.name AS block_name,
          c.code AS course_code,
          d.name AS department_name,
          d.code AS department_code,
          y.name AS year_level,
          ed.event_date,
          ed.am_in AS event_am_in,
          ed.am_out AS event_am_out,
          ed.pm_in AS event_pm_in,
          ed.pm_out AS event_pm_out,
          a.am_in AS student_am_in,
          a.am_out AS student_am_out,
          a.pm_in AS student_pm_in,
          a.pm_out AS student_pm_out
        FROM users u
        JOIN blocks b ON u.block_id = b.id
        JOIN courses c ON b.course_id = c.id
        JOIN departments d ON b.department_id = d.id
        JOIN year_levels y ON b.year_level_id = y.id
        JOIN event_blocks eb ON eb.block_id = b.id AND eb.event_id = ?
        JOIN event_dates ed ON ed.event_id = eb.event_id
        LEFT JOIN attendance a ON a.student_id_number = u.id_number AND a.event_date_id = ed.id
        WHERE b.id = ?
      `;

      const params = [event_id, block_id];

      if (
        search_query &&
        typeof search_query === "string" &&
        search_query.trim() !== ""
      ) {
        const likeQuery = `%${search_query.trim()}%`;
        query += ` AND (
          u.id_number LIKE ? OR 
          u.first_name LIKE ? OR 
          u.last_name LIKE ? OR
          CONCAT(u.first_name, ' ', u.last_name) LIKE ? OR
          CONCAT(u.last_name, ', ', u.first_name) LIKE ?
        )`;
        params.push(likeQuery, likeQuery, likeQuery, likeQuery, likeQuery);
      }

      query += ` ORDER BY ed.event_date, u.last_name, u.first_name`;

      const [rows] = await connection.query(query, params);

      const [eventDetails] = await connection.query(
        `SELECT en.name AS event_name, e.venue, e.description, e.status AS event_status
         FROM events e
         JOIN event_names en ON e.event_name_id = en.id
         WHERE e.id = ?`,
        [event_id]
      );

      const studentMap = {};

      rows.forEach((row) => {
        const studentKey = row.student_id;

        if (!studentMap[studentKey]) {
          studentMap[studentKey] = {
            student_id: row.student_id,
            name: `${row.last_name}, ${row.first_name}${
              row.middle_name ? " " + row.middle_name.charAt(0) + "." : ""
            }${row.suffix ? " " + row.suffix : ""}`,
            first_name: row.first_name,
            middle_name: row.middle_name,
            last_name: row.last_name,
            suffix: row.suffix,
            email: row.email,
            status: row.user_status,
            dates: [],
          };
        }

        studentMap[studentKey].dates.push({
          date: row.event_date
            ? row.event_date.toISOString().split("T")[0]
            : "unknown",
          schedule: {
            am_in: row.event_am_in,
            am_out: row.event_am_out,
            pm_in: row.event_pm_in,
            pm_out: row.event_pm_out,
          },
          attendance: {
            am_in: Boolean(row.student_am_in),
            am_out: Boolean(row.student_am_out),
            pm_in: Boolean(row.student_pm_in),
            pm_out: Boolean(row.student_pm_out),
          },
        });
      });

      const students = Object.values(studentMap);

      const total = students.length;
      const pageInt = parseInt(page);
      const limitInt = parseInt(limit);
      const startIndex = (pageInt - 1) * limitInt;
      const endIndex = startIndex + limitInt;
      const paginatedStudents = students.slice(startIndex, endIndex);

      const result = {
        success: true,
        message: "Student attendance data retrieved successfully.",
        data: {
          event_id: Number(event_id),
          event_name:
            eventDetails.length > 0
              ? eventDetails[0].event_name
              : "Unknown Event",
          event_details:
            eventDetails.length > 0
              ? {
                  venue: eventDetails[0].venue,
                  description: eventDetails[0].description,
                  status: eventDetails[0].event_status,
                }
              : null,
          block_id: Number(block_id),
          block_name: rows.length > 0 ? rows[0].block_name : "Unknown Block",
          course_code: rows.length > 0 ? rows[0].course_code : null,
          department:
            rows.length > 0
              ? {
                  name: rows[0].department_name,
                  code: rows[0].department_code,
                }
              : null,
          year_level: rows.length > 0 ? rows[0].year_level : null,
          students: paginatedStudents,
          pagination: {
            total,
            page: pageInt,
            limit: limitInt,
            total_pages: Math.ceil(total / limitInt),
          },
        },
      };

      return res.status(200).json(result);
    } finally {
      connection.release();
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "An error occurred while processing the request.",
      error: error.message,
    });
  }
};
