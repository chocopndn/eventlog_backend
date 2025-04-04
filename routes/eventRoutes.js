const express = require("express");
const router = express.Router();

const eventController = require("../controllers/eventsController");

router.route("/user/upcoming").post(eventController.userUpcomingEvents);
router.route("/user/attendance").post(eventController.recordAttendance);
router.route("/admin/add").post(eventController.addEvent);
router.route("/admin/edit").post(eventController.editEvent);
router.route("/admin/edit/:id").put(eventController.updateEventById);
router.route("/admin/delete/:id").delete(eventController.deleteEventById);
router.route("/admin/approve/:id").put(eventController.approveEventById);
router.route("/names").get(eventController.getAllEventNames);
router.route("/editable").get(eventController.getEditableEvents);
router.route("/events/:id").get(eventController.getEventById);
router.route("/approved-ongoing").get(eventController.getApprovedOngoingEvents);
router.route("/").get(eventController.getAllEvents);

module.exports = router;
