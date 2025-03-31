const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();

app.use(cors());
app.use(express.json());

const authRoutes = require("./routes/authRoute");
const departmentRoutes = require("./routes/departmentRoute");
const userRoutes = require("./routes/userRoute");
const eventRoutes = require("./routes/eventRoutes");
const blockRoutes = require("./routes/blockRoutes");
const adminRoutes = require("./routes/adminRoutes");
const courseRoutes = require("./routes/courseRoutes");

app.use(`/api/auth`, authRoutes);
app.use(`/api/departments`, departmentRoutes);
app.use(`/api/users/`, userRoutes);
app.use(`/api/events/`, eventRoutes);
app.use(`/api/blocks/`, blockRoutes);
app.use(`/api/admins`, adminRoutes);
app.use(`/api/courses`, courseRoutes);

app.get("/", (req, res) => {
  res.send("API is running...");
});

module.exports = app;
