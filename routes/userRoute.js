const express = require("express");
const router = express.Router();

const userController = require("../controllers/userController");

router.post("/change-password", userController.changePassword);
router.get("/", userController.getAllUsers);
router.post("/id-number/:id", userController.getAllUsersByID);
router.post("/department/:id", userController.getUsersByDepartment);

module.exports = router;
