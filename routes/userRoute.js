const express = require("express");
const router = express.Router();

const userController = require("../controllers/userController");

router.get("/", userController.getAllUsers);
router.get("/:id", userController.getUserById);
router.get("/department/:department_id", userController.getUsersByDepartment);
router.get("/block/:block_id", userController.getUsersByBlock);
router.get("/year-level/:yearlevel_id", userController.getUsersByYearLevel);
router.post("/change-password", userController.changePassword);

module.exports = router;
