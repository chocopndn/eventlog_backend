const express = require("express");
const router = express.Router();

const blockController = require("../controllers/blockController");

router.route("/").get(blockController.getAllBlocks);
router.route("/").post(blockController.addBlock);
router
  .route("/departments/:departmentId")
  .get(blockController.getBlocksByDepartment);
router.route("/block/:id").get(blockController.getBlockById);
router.route("/block/:id").put(blockController.editBlock);
router.route("/:id").delete(blockController.deleteBlock);
module.exports = router;
