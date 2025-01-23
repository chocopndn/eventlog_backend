const express = require("express");
require("dotenv").config();
const app = express();

app.use(express.json());

const authRoutes = require("./routes/authRoute");
const departmentRoutes = require("./routes/departmentRoute");
const userRoutes = require("./routes/userRoute");

app.use(`/api/auth`, authRoutes);
app.use(`/api/`, departmentRoutes);
app.use(`/api/user/`, userRoutes);

app.get("/", (req, res) => {
  res.send("API is running...");
});

module.exports = app;
