const express = require("express");
const {
  addChild,
  getAllChildren,
  getChildById,
  getChildrenByClassroom,
  updateChild,
  toggleStatus,
  deleteChild,
  searchParents,
} = require("../../../Controllers/Admin/adminChildrenController");
const {
  getAttendanceByMonth,
  markAttendance,
  updateAttendance,
  deleteAttendance,
} = require("../../../Controllers/Admin/adminChildAttendance");
const router = express.Router();
const { addChildValidator, updateChildValidator } = require("../../../Validator/childValidator");
const { uploadFile } = require("../../../Middlewares/upload");
const { adminRoute, staffRoute } = require("../../../Middlewares/auth");

router.post("/addChild", adminRoute, uploadFile, addChildValidator, addChild);
router.get("/getAllChildren", adminRoute, getAllChildren);
router.get("/searchParents", adminRoute, searchParents);
router.get("/getChildById/:id", adminRoute, getChildById);
router.get("/getAttendanceByMonth/:id", adminRoute, getAttendanceByMonth);
router.post("/markAttendance/:id", adminRoute, markAttendance);
router.post("/updateAttendance/:id", adminRoute, updateAttendance);
router.post("/deleteAttendance/:id", adminRoute, deleteAttendance);
router.get("/getChildrenByClassroom/:id", staffRoute, getChildrenByClassroom);
router.post("/updateChild/:id", adminRoute, uploadFile, updateChildValidator, updateChild);
router.post("/updateChild", adminRoute, uploadFile, updateChildValidator, updateChild);
router.get("/toggleStatus/:id", adminRoute, toggleStatus);
router.get("/deleteChild/:id", adminRoute, deleteChild);

module.exports = router;
