const express = require("express");
const router = express.Router();

const eventController = require("../controllers/eventsController");

router.route("/user/upcoming").get(eventController.userUpcomingEvents);

module.exports = router;
