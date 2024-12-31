const express = require("express");
require("dotenv").config();
const app = express();

app.use(express.json());

const authRoutes = require("./routes/authRoute");

app.use(`/api/auth`, authRoutes);

app.get("/", (req, res) => {
  res.send("API is running...");
});

module.exports = app;
