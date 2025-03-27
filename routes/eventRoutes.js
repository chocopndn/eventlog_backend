const express = require("express");
const router = express.Router();

const eventController = require("../controllers/eventsController");

router.route("/user/upcoming").post(eventController.userUpcomingEvents);
router.route("/user/attendance").post(eventController.recordAttendance);

router.route("/admin/add").post(eventController.addEvent);
router.route("/admin/edit").post(eventController.editEvent);
router.route("/admin/edit/:id").put(eventController.updateEventById);
router.route("/names").get(eventController.getAllEventNames);
router.route("/editable").get(eventController.getEditableEvents);
router.get("/:id", eventController.getEventById);

module.exports = router;
