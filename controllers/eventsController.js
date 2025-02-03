const { pool } = require("../config/db");

exports.getEvents = async (req, res) => {
  const {
    departmentIds,
    blockIds,
    event_name_id,
    venue,
    description,
    dates,
    am_in,
    am_out,
    pm_in,
    pm_out,
    duration,
  } = req.body;

  if (
    !Array.isArray(departmentIds) ||
    !Array.isArray(blockIds) ||
    !Array.isArray(dates) ||
    !event_name_id ||
    !venue
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid input. Check your fields.",
    });
  }

  try {
    await pool.query("START TRANSACTION");

    for (const deptId of departmentIds) {
      for (const blockId of blockIds) {
        for (const eventDate of dates) {
          const query = `
            INSERT INTO events 
              (department_id, block_id, event_name_id, venue, date_of_event, am_in, am_out, pm_in, pm_out, duration)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          const params = [
            deptId,
            blockId,
            event_name_id,
            venue,
            eventDate,
            am_in,
            am_out,
            pm_in,
            pm_out,
            duration,
          ];

          await pool.query(query, params);
        }
      }
    }

    await pool.query("COMMIT");
    return res.status(201).json({
      success: true,
      message: "Event(s) created successfully.",
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
