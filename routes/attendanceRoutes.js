const express = require("express");
const router = express.Router();

const attendanceController = require("../controllers/attendanceController");

router.route("/sync").post(attendanceController.syncAttendance);

module.exports = router;
