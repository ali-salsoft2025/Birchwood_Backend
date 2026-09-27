const express = require("express")
const { markCheckIn,markCheckOut,markLeave,getSchedule,getAllMyAttendance,getAttendanceById,getAttendanceByMonth,getMonthlyAttendanceStats } = require("../../../Controllers/Teacher/attendanceController");
const router = express.Router()
const {uploadFile} = require("../../../Middlewares/upload")
const { teacherCheckInValidator ,teacherCheckOutValidator,teacherLeaveValidator } = require("../../../Validator/attendanceValidator")
const { authenticatedRoute,adminRoute } = require("../../../Middlewares/auth")


router.post("/markCheckIn",authenticatedRoute,teacherCheckInValidator, markCheckIn);
router.post("/markCheckOut",authenticatedRoute,teacherCheckOutValidator, markCheckOut);
router.post("/markLeave",authenticatedRoute,teacherLeaveValidator, markLeave);
router.get("/schedule",authenticatedRoute, getSchedule);
router.get("/getAllMyAttendance",authenticatedRoute, getAllMyAttendance);
router.get("/getAttendanceById/:id",authenticatedRoute, getAttendanceById);
router.get("/getAttendanceByMonth",authenticatedRoute, getAttendanceByMonth);
router.get("/getMonthlyAttendanceStats",authenticatedRoute, getMonthlyAttendanceStats);

module.exports = router