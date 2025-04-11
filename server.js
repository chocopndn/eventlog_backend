const app = require("./app");
const { pool } = require("./config/db");
const cron = require("node-cron");
const { archivePastEvents } = require("./helpers/archivePastEvents");

console.log("Starting the server...");

(async () => {
  try {
    const connection = await pool.getConnection();
    console.log("Database connected successfully.");
    connection.release();

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, async () => {
      console.log(`Server running on port ${PORT}`);

      await archivePastEvents();
    });

    cron.schedule("0 0 * * *", async () => {
      await archivePastEvents();
    });
  } catch (error) {
    console.error("Error connecting to the database:", error);
  }
})();
