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
          eb.event_id,
          e.event_name_id,
          en.name AS event_title,
          b.id AS block_id,
          b.name AS block_name,
          c.id AS course_id,
          c.code AS course_code,           
          b.department_id,
          b.year_level_id
        FROM event_blocks eb
        JOIN blocks b ON eb.block_id = b.id
        JOIN events e ON eb.event_id = e.id
        JOIN event_names en ON e.event_name_id = en.id
        JOIN courses c ON b.course_id = c.id  
        WHERE e.status IN ('Approved', 'Archived') AND eb.event_id = ?
      `;

      const params = [event_id];

      if (department_id) {
        query += ` AND b.department_id = ?`;
        params.push(department_id);
      }

      if (year_level_id) {
        query += ` AND b.year_level_id = ?`;
        params.push(year_level_id);
      }

      if (
        search_query &&
        typeof search_query === "string" &&
        search_query.trim() !== ""
      ) {
        const likeQuery = `%${search_query.trim()}%`;
        query += ` AND (b.name LIKE ? OR c.code LIKE ?)`;
        params.push(likeQuery, likeQuery);
      }

      console.log("🔧 Final query:", query);
      console.log("🧾 Parameters:", params);

      const [rows] = await connection.query(query, params);

      if (rows.length === 0) {
        return res.status(404).json({
          success: true,
          message: "No matching data found.",
          data: {
            event_id: event_id,
            event_title: "Event Blocks",
            block_details: [],
            department_ids: [],
            yearlevel_ids: [],
          },
        });
      }

      const department_ids = [...new Set(rows.map((row) => row.department_id))];
      const yearlevel_ids = [...new Set(rows.map((row) => row.year_level_id))];

      const block_details = rows.map((row) => ({
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
          event_id: rows[0].event_id,
          event_title: rows[0].event_title,
          block_details,
          department_ids,
          yearlevel_ids,
        },
      };

      return res.status(200).json(result);
    } catch (dbError) {
      console.error("Database error:", dbError);
      return res.status(500).json({
        success: false,
        message: "Database error while fetching event block details.",
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("An error occurred:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while processing the request.",
    });
  }
};
