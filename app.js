const express = require("express");
const { sequelize } = require("./config/db");
const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("API is running...");
});

module.exports = app;
