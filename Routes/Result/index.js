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

const router = express.Router();

router.post("/createExam", adminRoute, createExam);
router.post("/updateExam/:id", adminRoute, updateExam);
router.post("/setExamStatus/:id", adminRoute, setExamStatus);
router.get("/deleteExam/:id", adminRoute, deleteExam);
router.get("/getAllExams", authenticatedRoute, getAllExams);
router.get("/getExamById/:id", authenticatedRoute, getExamById);
router.post("/upsertMarks/:id", authenticatedRoute, upsertMarks);
router.get("/getPublishedByChild/:childId", authenticatedRoute, getPublishedByChild);
router.get("/getPublishedExam/:id", authenticatedRoute, getPublishedExamForChild);

module.exports = router;
