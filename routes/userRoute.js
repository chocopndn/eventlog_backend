const express = require("express");
const router = express.Router();

const userController = require("../controllers/userController");

router.route("/resetPassword").post(userController.resetPassword);

module.exports = router;
