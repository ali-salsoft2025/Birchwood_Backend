const express = require("express");
const router = express.Router();

router.use("/auth", require("./Parent/Auth"));
router.use("/profile", require("./Parent/Profile"));

router.use("/teacher/auth", require("./Teacher/TeacherAuth"));
router.use("/teacher/profile", require("./Teacher/TeacherProfile"));
router.use("/teacher/attendance", require("./Teacher/TeacherAttendance"));

router.use("/activity", require("./Activity"));
router.use("/classroom", require("./Classroom"));

router.use("/children", require("./Children/ChildrenProfile"));
router.use("/children/attendance", require("./Children/ChildrenAttendance"));

router.use("/post", require("./Post"));
router.use("/inventory", require("./Inventory"));
router.use("/fees", require("./Fees"));
router.use("/timetable", require("./Timetable"));
router.use("/category", require("./Category"));
router.use("/holiday", require("./Holidays"));
router.use("/homework", require("./Homework"));
router.use("/notification", require("./Notification"));
router.use("/support", require("./Support"));
router.use("/advertisement", require("./Advertisement"));

router.use("/admin/auth", require("./Admin/AdminAuth"));
router.use("/admin/teacher", require("./Admin/AdminTeacher"));
router.use("/admin/parent", require("./Admin/AdminParent"));
router.use("/admin/children", require("./Admin/AdminChildren"));
router.use("/admin/dashboard", require("./Admin/AdminDashboard"));

module.exports = router;
