const express = require("express");
const {
  getModules,
  updateModules,
  getTeacherRules,
  updateTeacherRules,
  getPendingTeacherLeaves,
  reviewTeacherLeave,
} = require("../../Controllers/Settings");
const { adminRoute, authenticatedRoute } = require("../../Middlewares/auth");

const router = express.Router();

router.get("/getModules", authenticatedRoute, getModules);
router.post("/updateModules", adminRoute, updateModules);
router.get("/getTeacherRules", adminRoute, getTeacherRules);
router.post("/updateTeacherRules", adminRoute, updateTeacherRules);
router.get("/pendingTeacherLeaves", adminRoute, getPendingTeacherLeaves);
router.post("/reviewTeacherLeave/:id", adminRoute, reviewTeacherLeave);

module.exports = router;
