const { pool } = require("../config/db");

const archivePastEvents = async () => {
  const connection = await pool.getConnection();

  try {
    console.log("LOG: Starting archive past events process...");

    await connection.beginTransaction();

    const [eventsToArchive] = await connection.query(`
      SELECT 
        events.id AS event_id, 
        event_names.name AS event_name, 
        latestEventDates.last_event_date
      FROM events
      JOIN event_names ON events.event_name_id = event_names.id
      JOIN (
        SELECT event_id, MAX(event_date) AS last_event_date
        FROM event_dates
        GROUP BY event_id
      ) AS latestEventDates ON events.id = latestEventDates.event_id
      WHERE events.status = 'Approved'
        AND latestEventDates.last_event_date < CURDATE()
      ORDER BY latestEventDates.last_event_date ASC;
    `);

    if (eventsToArchive.length === 0) {
      console.log("LOG: No past events found to archive");
      await connection.commit();
      return {
        success: true,
        archivedCount: 0,
        message: "No events to archive",
      };
    }

    console.log(
      `LOG: Found ${eventsToArchive.length} events to archive:`,
      eventsToArchive.map(
        (e) =>
          `${e.event_name} (ID: ${e.event_id}, Last Date: ${e.last_event_date})`
      )
    );

    const eventIdsToArchive = eventsToArchive.map((event) => event.event_id);

    const placeholders = eventIdsToArchive.map(() => "?").join(",");

    const [updateResult] = await connection.query(
      `UPDATE events SET 
         status = 'Archived', 
         archived_at = NOW() 
       WHERE id IN (${placeholders})`,
      eventIdsToArchive
    );

    if (updateResult.affectedRows !== eventIdsToArchive.length) {
      throw new Error(
        `Expected to archive ${eventIdsToArchive.length} events, but only ${updateResult.affectedRows} were updated`
      );
    }

    await connection.commit();

    console.log(
      `LOG: Successfully archived ${updateResult.affectedRows} past events`
    );

    return {
      success: true,
      archivedCount: updateResult.affectedRows,
      archivedEvents: eventsToArchive.map((e) => ({
        id: e.event_id,
        name: e.event_name,
        lastEventDate: e.last_event_date,
      })),
      message: `Successfully archived ${updateResult.affectedRows} past events`,
    };
  } catch (error) {
    await connection.rollback();

    console.error("LOG: Error archiving past events:", {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });

    return {
      success: false,
      archivedCount: 0,
      error: error.message,
      message: "Failed to archive past events",
    };
  } finally {
    connection.release();
  }
};

const getArchivedEventsCount = async (dateRange = null) => {
  try {
    let query = `
      SELECT COUNT(*) as count 
      FROM events 
      WHERE status = 'Archived'
    `;

    const params = [];

    if (dateRange) {
      query += ` AND archived_at >= ? AND archived_at <= ?`;
      params.push(dateRange.start, dateRange.end);
    }

    const [result] = await pool.query(query, params);
    return result[0].count;
  } catch (error) {
    console.error("LOG: Error getting archived events count:", error.message);
    return 0;
  }
};

const archiveSpecificEvents = async (eventIds) => {
  if (!Array.isArray(eventIds) || eventIds.length === 0) {
    throw new Error("Event IDs must be a non-empty array");
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const placeholders = eventIds.map(() => "?").join(",");

    const [updateResult] = await connection.query(
      `UPDATE events SET 
         status = 'Archived', 
         archived_at = NOW() 
       WHERE id IN (${placeholders}) 
         AND status != 'Archived'`,
      eventIds
    );

    await connection.commit();

    console.log(`LOG: Manually archived ${updateResult.affectedRows} events`);

    return {
      success: true,
      archivedCount: updateResult.affectedRows,
    };
  } catch (error) {
    await connection.rollback();
    console.error("LOG: Error manually archiving events:", error.message);
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  archivePastEvents,
  getArchivedEventsCount,
  archiveSpecificEvents,
};
