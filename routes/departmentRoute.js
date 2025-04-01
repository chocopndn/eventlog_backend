const express = require("express");
const router = express.Router();

const departmentController = require("../controllers/departmentController");

router.route("/departments").get(departmentController.getDepartments);
router.route("/departments/:id").get(departmentController.getDepartmentById);
router.route("/departments").post(departmentController.addDepartment);
router.route("/departments/:id").put(departmentController.updateDepartment);
router.route("/departments/del/:id").put(departmentController.deleteDepartment);

module.exports = router;
