const express = require("express");
const {
  addTimetable,
  getAllClassTimetables,
  getTimetableByDayAndClass,
  updateTimetable,
  deleteTimetable,
  copyTimetable,
} = require("../../Controllers/Timetable");
const router = express.Router();
const { authenticatedRoute, staffRoute } = require("../../Middlewares/auth");
const { addTimeTableValidator } = require("../../Validator/timeTableValidator");

router.post("/addTimetable", staffRoute, addTimeTableValidator, addTimetable);
router.post("/copyTimetable", staffRoute, copyTimetable);
router.get("/getAllClassTimetables/:classroom", authenticatedRoute, getAllClassTimetables);
router.get("/getTimetableByDayAndClass", authenticatedRoute, getTimetableByDayAndClass);
router.post("/updateTimetable/:id", staffRoute, updateTimetable);
router.get("/deleteTimetable/:id", staffRoute, deleteTimetable);

module.exports = router;
