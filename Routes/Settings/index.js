const express = require("express");
const {
  getModules,
  updateModules,
  getAppInfo,
  updateAppInfo,
  getTeacherRules,
  updateTeacherRules,
  listTeacherDutyDays,
  saveTeacherDutyDay,
  deleteTeacherDutyDay,
  getPendingTeacherLeaves,
  reviewTeacherLeave,
} = require("../../Controllers/Settings");
const { adminRoute, authenticatedRoute } = require("../../Middlewares/auth");

const router = express.Router();

router.get("/getModules", authenticatedRoute, getModules);
router.get("/getAppInfo", authenticatedRoute, getAppInfo);
router.post("/updateAppInfo", adminRoute, updateAppInfo);
router.post("/updateModules", adminRoute, updateModules);
router.get("/getTeacherRules", adminRoute, getTeacherRules);
router.post("/updateTeacherRules", adminRoute, updateTeacherRules);
router.get("/teacherDutyDays", adminRoute, listTeacherDutyDays);
router.post("/teacherDutyDays", adminRoute, saveTeacherDutyDay);
router.post("/teacherDutyDays/delete/:id", adminRoute, deleteTeacherDutyDay);
router.get("/pendingTeacherLeaves", adminRoute, getPendingTeacherLeaves);
router.post("/reviewTeacherLeave/:id", adminRoute, reviewTeacherLeave);

module.exports = router;
