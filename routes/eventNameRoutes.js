const express = require("express");
const router = express.Router();

const eventNamesController = require("../controllers/eventNamesController");

router.post("/add", eventNamesController.addEventName);
router.get("/", eventNamesController.getAllEventNames);
router.get("/:id", eventNamesController.getEventNameByID);
router.put("/update/:id", eventNamesController.updateEventName);
router.delete("/delete/:id", eventNamesController.deleteEventName);

module.exports = router;
