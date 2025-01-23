const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");

router.route("/signup").post(authController.signup);
router.route("/login").post(authController.login);
router.route("/resetPassword").post(authController.resetPassword);
router.route("/verifyResetCode").post(authController.verifyResetCode);

module.exports = router;
