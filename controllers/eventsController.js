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

    if (!allEvents.length) {
      return res.json({
        success: true,
        events: [],
      });
    }

    const groupedEvents = {};

    allEvents.forEach((event) => {
      const eventKey = event.event_name_id;

      if (!groupedEvents[eventKey]) {
        groupedEvents[eventKey] = {
          event_id: event.event_id,
          event_name: event.event_name,
          venue: event.venue,
          scan_personnel: event.scan_personnel,
          dates: [],
          am_in: null,
          am_out: null,
          pm_in: null,
          pm_out: null,
        };
      }

      const formattedEventDate = moment(event.date_of_event).format(
        "YYYY-MM-DD"
      );

      groupedEvents[eventKey].dates.push(formattedEventDate);

      groupedEvents[eventKey].am_in = event.am_in
        ? moment.utc(event.am_in, "HH:mm:ss").format("HH:mm:ss")
        : null;
      groupedEvents[eventKey].am_out = event.am_out
        ? moment.utc(event.am_out, "HH:mm:ss").format("HH:mm:ss")
        : null;
      groupedEvents[eventKey].pm_in = event.pm_in
        ? moment.utc(event.pm_in, "HH:mm:ss").format("HH:mm:ss")
        : null;
      groupedEvents[eventKey].pm_out = event.pm_out
        ? moment.utc(event.pm_out, "HH:mm:ss").format("HH:mm:ss")
        : null;
    });

    let formattedEvents = Object.values(groupedEvents);

    formattedEvents.forEach((event) => {
      event.dates.sort((a, b) => new Date(a) - new Date(b));
    });

    formattedEvents.sort((a, b) => new Date(a.dates[0]) - new Date(b.dates[0]));

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
