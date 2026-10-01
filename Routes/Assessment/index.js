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
const { requireModule } = require("../../Middlewares/requireModule");

const router = express.Router();
const testsOn = requireModule("assessments");

router.post("/createAssessment", authenticatedRoute, testsOn, createAssessment);
router.post("/updateAssessment/:id", authenticatedRoute, testsOn, updateAssessment);
router.post("/setAssessmentStatus/:id", authenticatedRoute, testsOn, setAssessmentStatus);
router.get("/deleteAssessment/:id", authenticatedRoute, testsOn, deleteAssessment);
router.get("/getMyAssessments", authenticatedRoute, testsOn, getMyAssessments);
router.get("/getAssessmentById/:id", authenticatedRoute, testsOn, getAssessmentById);
router.post("/upsertMarks/:id", authenticatedRoute, testsOn, upsertAssessmentMarks);
router.get("/getPublishedByChild/:childId", authenticatedRoute, testsOn, getPublishedByChild);

module.exports = router;
