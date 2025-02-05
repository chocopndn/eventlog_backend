const { pool } = require("../config/db");

exports.userUpcomingEvents = async (req, res) => {
  const { block_id } = req.body;
  const currentDate = new Date().toISOString().split("T")[0];

  try {
    const query = `
      SELECT 
        events.event_id,
        events.department_id,
        events.block_id,
        events.event_name_id, 
        event_names.event_name,
        events.venue, 
        events.date_of_event,
        events.scan_personnel,
        events.am_in,
        events.am_out,
        events.pm_in,
        events.pm_out
      FROM events
      JOIN event_names ON events.event_name_id = event_names.event_name_id
      WHERE events.date_of_event >= ?  -- Only future events (including today)
    `;

    const [allEvents] = await pool.query(query, [currentDate]);

    const formatTime = (time) => {
      if (!time) return null;
      const [hours, minutes] = time.split(":");
      const hour = parseInt(hours, 10);
      const period = hour >= 12 ? "PM" : "AM";
      const formattedHour = hour % 12 || 12;
      return `${formattedHour}:${minutes} ${period}`;
    };

    const filteredEvents = allEvents
      .map((event) => ({
        ...event,
        am_in: formatTime(event.am_in),
        am_out: formatTime(event.am_out),
        pm_in: formatTime(event.pm_in),
        pm_out: formatTime(event.pm_out),
      }))
      .filter((event) => event.block_id === null || event.block_id == block_id);

    const groupedEvents = {};
    filteredEvents.forEach((event) => {
      const groupKey = `${event.event_name_id}-${event.venue}-${event.scan_personnel}`;

      if (!groupedEvents[groupKey]) {
        groupedEvents[groupKey] = {
          event_name_id: event.event_name_id,
          event_name: event.event_name,
          venue: event.venue,
          scan_personnel: event.scan_personnel,
          event_dates: [],
          am_in: event.am_in,
          am_out: event.am_out,
          pm_in: event.pm_in,
          pm_out: event.pm_out,
        };
      }

      groupedEvents[groupKey].event_dates.push(event.date_of_event);
    });

    const formattedEvents = Object.values(groupedEvents).map((event) => ({
      ...event,
      event_dates: formatGroupedDates(event.event_dates),
    }));

    return res.json({
      success: true,
      events: formattedEvents,
    });
  } catch (error) {
    console.error("Error in getUserEvents:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

function formatGroupedDates(dates) {
  if (!dates || dates.length === 0) return "";

  dates.sort((a, b) => new Date(a) - new Date(b));

  let formattedDates = [];
  let month = "";
  let year = "";

  dates.forEach((date, index) => {
    const parsedDate = new Date(date);
    const day = parsedDate.getDate();
    const currentMonth = parsedDate.toLocaleString("en-US", { month: "long" });
    const currentYear = parsedDate.getFullYear();

    if (index === 0) {
      month = currentMonth;
      year = currentYear;
    }

    formattedDates.push(day);
  });

  return `${month} ${formattedDates.join(",")} ${year}`;
}

function formatDateRange(days) {
  if (days.length >= 2) {
    return `${days[0]}-${days[days.length - 1]}`;
  }
  return days.join(",");
}
