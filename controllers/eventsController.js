const { pool } = require("../config/db");
const moment = require("moment");

exports.userUpcomingEvents = async (req, res) => {
  const { block_id } = req.query;

  if (!block_id) {
    return res.status(400).json({
      success: false,
      message: "Block ID is required",
    });
  }

  const currentDate = new Date().toISOString().split("T")[0];

  try {
    let query = `
      SELECT 
        events.id AS event_id,
        events.event_name_id, 
        event_names.name AS event_name,
        events.venue, 
        event_dates.event_date AS date_of_event,
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
      AND (
        event_blocks.block_id = ? 
        OR event_blocks.block_id IS NULL 
      )
      AND event_blocks.event_id IS NOT NULL 
    `;

    const [allEvents] = await pool.query(query, [currentDate, block_id]);

    const groupedEvents = {};

    allEvents.forEach((event) => {
      const eventKey = event.event_name_id;

      if (!groupedEvents[eventKey]) {
        groupedEvents[eventKey] = {
          event_id: event.event_id,
          event_name: event.event_name,
          venue: event.venue,
          scan_personnel: event.scan_personnel,
          am_in: event.am_in,
          am_out: event.am_out,
          pm_in: event.pm_in,
          pm_out: event.pm_out,
          dates: [],
        };
      }

      const formattedEventDate = moment(event.date_of_event).format(
        "YYYY-MM-DD"
      );

      const formattedAmIn = moment
        .utc(event.am_in, "HH:mm:ss")
        .format("HH:mm:ss");
      const formattedAmOut = moment
        .utc(event.am_out, "HH:mm:ss")
        .format("HH:mm:ss");
      const formattedPmIn = moment
        .utc(event.pm_in, "HH:mm:ss")
        .format("HH:mm:ss");
      const formattedPmOut = moment
        .utc(event.pm_out, "HH:mm:ss")
        .format("HH:mm:ss");

      groupedEvents[eventKey].dates.push(formattedEventDate);

      groupedEvents[eventKey].am_in = formattedAmIn;
      groupedEvents[eventKey].am_out = formattedAmOut;
      groupedEvents[eventKey].pm_in = formattedPmIn;
      groupedEvents[eventKey].pm_out = formattedPmOut;
    });

    const formattedEvents = Object.values(groupedEvents);

    return res.json({
      success: true,
      events: formattedEvents,
    });
  } catch (error) {
    console.error("Error in userUpcomingEvents:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
