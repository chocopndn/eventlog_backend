const express = require("express");
const router = express.Router();

const courseController = require("../controllers/courseController");

router.route("/").get(courseController.getAllCourses);
router.route("/:id").delete(courseController.deleteCourse);
router.route("/:id").get(courseController.fetchCourseById);
router.route("/add-course").post(courseController.addCourse);
router.route("/edit/:id").put(courseController.editCourse);

module.exports = router;
