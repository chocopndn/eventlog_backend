const express = require("express");
const router = express.Router();

const attendanceController = require("../controllers/attendanceController");

router.route("/sync").post(attendanceController.syncAttendance);
router
  .route("/user/ongoing/events")
  .post(attendanceController.fetchUserOngoingEvents);
router
  .route("/user/past/events")
  .post(attendanceController.fetchUserPastEvents);

module.exports = router;
