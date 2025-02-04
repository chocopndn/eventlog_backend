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
        events.scan_personnel
      FROM events
      JOIN event_names ON events.event_name_id = event_names.event_name_id
      WHERE events.date_of_event >= ?  -- Only future events (including today)
    `;

    const [allEvents] = await pool.query(query, [currentDate]);

    const filteredEvents = allEvents.filter(
      (event) => event.block_id === null || event.block_id == block_id
    );

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
  let formattedDates = [];
  let currentRange = [];
  let lastDay = null;
  let currentMonthYear = "";

  dates.sort((a, b) => new Date(a) - new Date(b));

  dates.forEach((date, index) => {
    const parsedDate = new Date(date);
    const day = parsedDate.getDate();
    const month = parsedDate.toLocaleString("en-US", { month: "long" });
    const year = parsedDate.getFullYear();
    const fullDate = `${month} ${year}`;

    if (!lastDay) {
      lastDay = parsedDate;
      currentRange.push(day);
      currentMonthYear = fullDate;
    } else {
      const diff = (parsedDate - lastDay) / (1000 * 60 * 60 * 24);

      if (diff === 1) {
        currentRange.push(day);
      } else {
        formattedDates.push(
          `${currentMonthYear} ${formatDateRange(currentRange)}`
        );
        currentRange = [day];
        currentMonthYear = fullDate;
      }

      lastDay = parsedDate;
    }

    if (index === dates.length - 1) {
      formattedDates.push(`${formatDateRange(currentRange)} ${year}`);
    }
  });

  return formattedDates.join(", ");
}

function formatDateRange(days) {
  if (days.length >= 2) {
    return `${days[0]}-${days[days.length - 1]}`;
  }
  return days.join(",");
}
