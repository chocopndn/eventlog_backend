const { pool } = require("../config/db");
const moment = require("moment");

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
      return res.json({
        success: true,
        events: [],
      });
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

    return res.json({
      success: true,
      events: formattedEvents,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};
