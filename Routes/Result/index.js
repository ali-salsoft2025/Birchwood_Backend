const express = require("express");
const {
  createExam,
  updateExam,
  setExamStatus,
  deleteExam,
  getAllExams,
  getExamById,
  upsertMarks,
  getPublishedByChild,
  getPublishedExamForChild,
} = require("../../Controllers/Result");
const { adminRoute, authenticatedRoute } = require("../../Middlewares/auth");
const { requireModule } = require("../../Middlewares/requireModule");

const router = express.Router();

const resultsOn = requireModule("results");

router.post("/createExam", adminRoute, resultsOn, createExam);
router.post("/updateExam/:id", adminRoute, resultsOn, updateExam);
router.post("/setExamStatus/:id", adminRoute, resultsOn, setExamStatus);
router.get("/deleteExam/:id", adminRoute, resultsOn, deleteExam);
router.get("/getAllExams", authenticatedRoute, resultsOn, getAllExams);
router.get("/getExamById/:id", authenticatedRoute, resultsOn, getExamById);
router.post("/upsertMarks/:id", authenticatedRoute, resultsOn, upsertMarks);
router.get("/getPublishedByChild/:childId", authenticatedRoute, resultsOn, getPublishedByChild);
router.get("/getPublishedExam/:id", authenticatedRoute, resultsOn, getPublishedExamForChild);

module.exports = router;
