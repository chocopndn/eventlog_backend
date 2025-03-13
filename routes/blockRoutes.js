const express = require("express");
const router = express.Router();

const blockController = require("../controllers/blockController");

router.route("/").get(blockController.getAllBlocks);
router.route("/:departmentId").get(blockController.getBlocksByDepartment);

module.exports = router;
