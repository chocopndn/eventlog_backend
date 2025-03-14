const express = require("express");
const router = express.Router();

const userController = require("../controllers/userController");

router.post("/change-password", userController.changePassword);

module.exports = router;
