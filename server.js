const express = require("express");
const { sequelize } = require("./config/db");
const app = express();

app.use(express.json());

console.log("Starting the server...");

(async () => {
  try {
    await sequelize.authenticate();
    console.log("Database connected successfully.");

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Error connecting to the database:", error);
  }
})();

app.get("/", (req, res) => {
  res.send("API is running...");
});

module.exports = app;
