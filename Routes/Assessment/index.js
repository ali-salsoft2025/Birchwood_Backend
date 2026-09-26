const express = require("express");
const {
  createAssessment,
  updateAssessment,
  setAssessmentStatus,
  deleteAssessment,
  getMyAssessments,
  getAssessmentById,
  upsertAssessmentMarks,
  getPublishedByChild,
} = require("../../Controllers/Assessment");
const { authenticatedRoute } = require("../../Middlewares/auth");

const router = express.Router();

router.post("/createAssessment", authenticatedRoute, createAssessment);
router.post("/updateAssessment/:id", authenticatedRoute, updateAssessment);
router.post("/setAssessmentStatus/:id", authenticatedRoute, setAssessmentStatus);
router.get("/deleteAssessment/:id", authenticatedRoute, deleteAssessment);
router.get("/getMyAssessments", authenticatedRoute, getMyAssessments);
router.get("/getAssessmentById/:id", authenticatedRoute, getAssessmentById);
router.post("/upsertMarks/:id", authenticatedRoute, upsertAssessmentMarks);
router.get("/getPublishedByChild/:childId", authenticatedRoute, getPublishedByChild);

module.exports = router;
