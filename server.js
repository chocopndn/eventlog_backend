const app = require("./app");
const { pool } = require("./config/db");

console.log("Starting the server...");

(async () => {
  try {
    const connection = await pool.getConnection();
    console.log("Database connected successfully.");
    connection.release();

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Error connecting to the database:", error);
  }
})();
