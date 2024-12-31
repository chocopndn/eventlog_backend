const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");

router.route("/signup").post(authController.signup);
router.route("/login").get(authController.login);
router.route("/resetPassword").get(authController.resetPassword);

module.exports = router;
