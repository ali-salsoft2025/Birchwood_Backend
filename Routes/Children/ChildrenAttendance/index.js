const express = require("express")
const { markCheckIn, markCheckOut, markLeave, getAllChildAttendance, getAttendanceById, getAttendanceByMonth, getMonthlyAttendanceStats } = require("../../../Controllers/Children/childAttendanceController");
const router = express.Router()
const {uploadFile} = require("../../../Middlewares/upload")
const { childCheckInValidator ,childLeaveValidator } = require("../../../Validator/attendanceValidator")
const { authenticatedRoute,adminRoute } = require("../../../Middlewares/auth")


router.post("/markCheckIn",authenticatedRoute,childCheckInValidator, markCheckIn);
router.post("/markCheckOut",authenticatedRoute,childCheckInValidator, markCheckOut);
router.post("/markLeave",authenticatedRoute,childLeaveValidator, markLeave);
router.get("/getAllChildAttendance/:child",authenticatedRoute, getAllChildAttendance);
router.get("/getAttendanceById/:id",authenticatedRoute, getAttendanceById);
router.get("/getAttendanceByMonth/:child",authenticatedRoute, getAttendanceByMonth);
router.get("/getMonthlyAttendanceStats/:child",authenticatedRoute, getMonthlyAttendanceStats);

module.exports = router