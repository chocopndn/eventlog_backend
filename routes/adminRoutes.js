const express = require("express");
const router = express.Router();

const adminController = require("../controllers/adminController");

router.route("/").get(adminController.getAllAdmins);
router.route("/:id_number").delete(adminController.deleteAdmin);

module.exports = router;
