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

router
  .route("/admin/ongoing/events")
  .post(attendanceController.fetchAllOngoingEvents);
router
  .route("/admin/past/events")
  .post(attendanceController.fetchAllPastEvents);

  router
  .route("/events/blocks")
  .post(attendanceController.fetchBlocksOfEvents);

module.exports = router;
