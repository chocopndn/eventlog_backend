const express = require("express");
const router = express.Router();

const eventController = require("../controllers/eventsController");

router.route("/events").get(eventController.getEvents);

module.exports = router;
