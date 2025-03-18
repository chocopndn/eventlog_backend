const express = require("express");
const router = express.Router();

const eventController = require("../controllers/eventsController");

router.route("/user/upcoming").post(eventController.userUpcomingEvents);
router.route("/user/attendance").post(eventController.recordAttendance);

router.route("/admin/add").post(eventController.addEvent);
router.route("/admin/edit").post(eventController.editEvent);

module.exports = router;
