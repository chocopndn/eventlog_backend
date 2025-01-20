const express = require("express");
const router = express.Router();

const departmentController = require("../controllers/departmentController");

router.route("/departments").get(departmentController.getDepartment);

module.exports = router;
