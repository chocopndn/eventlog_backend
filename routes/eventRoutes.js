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
router.get("/events/:id", eventController.getEventById);
router.route("/approved-ongoing").get(eventController.getApprovedOngoingEvents);

module.exports = router;
