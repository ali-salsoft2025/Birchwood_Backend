const mongoose = require("mongoose");
const Exam = require("../../Models/Exam");
const StudentMark = require("../../Models/StudentMark");
const Children = require("../../Models/Children");
const Classroom = require("../../Models/Classroom");
const { ApiResponse } = require("../../Helpers/index");

const STATUSES = ["DRAFT", "OPEN", "CLOSED", "PUBLISHED"];

function letterGrade(pct) {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 75) return "B+";
  if (pct >= 70) return "B";
  if (pct >= 60) return "C";
  if (pct >= 50) return "D";
  return "F";
}

function normalizeSubjects(raw = []) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => ({
      name: String(item?.name || "").trim(),
      maxMarks: Math.max(1, Number(item?.maxMarks) || 100),
      order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index,
    }))
    .filter((item) => item.name);
}

function summarizeChild(exam, marksForChild) {
  const subjects = (exam.subjects || []).slice().sort((a, b) => a.order - b.order);
  const bySubject = new Map(
    (marksForChild || []).map((row) => [String(row.subject).toLowerCase(), row])
  );
  let totalMax = 0;
  let totalObtained = 0;
  let filled = 0;
  const rows = subjects.map((subject) => {
    const mark = bySubject.get(String(subject.name).toLowerCase());
    const maxMarks = Number(subject.maxMarks) || 100;
    const obtained = mark ? Number(mark.obtained) : null;
    totalMax += maxMarks;
    if (obtained != null && !Number.isNaN(obtained)) {
      totalObtained += obtained;
      filled += 1;
    }
    const pct = obtained == null ? null : Math.round((obtained / maxMarks) * 1000) / 10;
    return {
      subject: subject.name,
      maxMarks,
      obtained,
      percentage: pct,
      grade: pct == null ? null : letterGrade(pct),
      remarks: mark?.remarks || "",
    };
  });
  const percentage =
    totalMax > 0 && filled > 0
      ? Math.round((totalObtained / totalMax) * 1000) / 10
      : null;
  return {
    subjects: rows,
    totalMax,
    totalObtained: filled ? totalObtained : null,
    percentage,
    grade: percentage == null ? null : letterGrade(percentage),
    filled,
    expected: subjects.length,
    complete: subjects.length > 0 && filled === subjects.length,
  };
}

async function assertTeacherClassroom(req, classroomId) {
  if (req.isAdmin) return true;
  if (req.userRole !== "teacher") return false;
  const room = await Classroom.findById(classroomId).select("teacher").lean();
  return room && String(room.teacher) === String(req.user._id);
}

function canEditMarks(exam, req) {
  if (!exam) return false;
  if (req.isAdmin) return exam.status !== "PUBLISHED";
  if (req.userRole === "teacher") return exam.status === "OPEN";
  return false;
}

exports.createExam = async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json(ApiResponse({}, "Only admin can create exams", false));
    }
    const title = String(req.body.title || "").trim();
    const term = String(req.body.term || "").trim();
    const classroom = req.body.classroom;
    const subjects = normalizeSubjects(req.body.subjects);
    if (!title || !term || !classroom) {
      return res.status(400).json(ApiResponse({}, "Title, term and class are required", false));
    }
    if (!subjects.length) {
      return res.status(400).json(ApiResponse({}, "Add at least one subject", false));
    }
    const room = await Classroom.findById(classroom);
    if (!room) {
      return res.status(404).json(ApiResponse({}, "Classroom not found", false));
    }

    const exam = await Exam.create({
      title,
      term,
      academicYear: String(req.body.academicYear || "").trim(),
      classroom,
      examDate: req.body.examDate ? new Date(req.body.examDate) : new Date(),
      subjects,
      notes: String(req.body.notes || "").trim(),
      status: STATUSES.includes(String(req.body.status || "").toUpperCase())
        ? String(req.body.status).toUpperCase()
        : "DRAFT",
      createdBy: req.user._id,
    });

    return res
      .status(201)
      .json(ApiResponse({ exam }, "Exam created. Open it when teachers can enter marks.", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.updateExam = async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json(ApiResponse({}, "Only admin can update exams", false));
    }
    const exam = await Exam.findById(req.params.id);
    if (!exam) {
      return res.json(ApiResponse({}, "Exam not found", false));
    }
    if (exam.status === "PUBLISHED") {
      return res
        .status(400)
        .json(ApiResponse({}, "Unpublish the exam before editing details", false));
    }

    if (req.body.title != null) exam.title = String(req.body.title).trim();
    if (req.body.term != null) exam.term = String(req.body.term).trim();
    if (req.body.academicYear != null) exam.academicYear = String(req.body.academicYear).trim();
    if (req.body.notes != null) exam.notes = String(req.body.notes).trim();
    if (req.body.examDate) exam.examDate = new Date(req.body.examDate);
    if (req.body.classroom) {
      const room = await Classroom.findById(req.body.classroom);
      if (!room) {
        return res.status(404).json(ApiResponse({}, "Classroom not found", false));
      }
      exam.classroom = req.body.classroom;
    }
    if (req.body.subjects) {
      const subjects = normalizeSubjects(req.body.subjects);
      if (!subjects.length) {
        return res.status(400).json(ApiResponse({}, "Add at least one subject", false));
      }
      exam.subjects = subjects;
    }

    await exam.save();
    return res.json(ApiResponse({ exam }, "Exam updated", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.setExamStatus = async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json(ApiResponse({}, "Only admin can change exam status", false));
    }
    const exam = await Exam.findById(req.params.id);
    if (!exam) {
      return res.json(ApiResponse({}, "Exam not found", false));
    }
    const next = String(req.body.status || "").toUpperCase();
    if (!STATUSES.includes(next)) {
      return res.status(400).json(ApiResponse({}, "Invalid status", false));
    }
    if (next === "OPEN" && !(exam.subjects || []).length) {
      return res.status(400).json(ApiResponse({}, "Add subjects before opening for entry", false));
    }
    if (next === "PUBLISHED") {
      exam.publishedAt = new Date();
    }
    if (exam.status === "PUBLISHED" && next !== "PUBLISHED") {
      exam.publishedAt = null;
    }
    exam.status = next;
    await exam.save();

    const messages = {
      DRAFT: "Exam moved back to draft",
      OPEN: "Exam opened for teacher mark entry",
      CLOSED: "Mark entry closed",
      PUBLISHED: "Results published for parents",
    };
    return res.json(ApiResponse({ exam }, messages[next] || "Status updated", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.deleteExam = async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json(ApiResponse({}, "Only admin can delete exams", false));
    }
    const exam = await Exam.findById(req.params.id);
    if (!exam) {
      return res.json(ApiResponse({}, "Exam not found", false));
    }
    if (exam.status === "PUBLISHED") {
      return res
        .status(400)
        .json(ApiResponse({}, "Unpublish before deleting a published exam", false));
    }
    await StudentMark.deleteMany({ exam: exam._id });
    await exam.deleteOne();
    return res.json(ApiResponse({}, "Exam deleted", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getAllExams = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
    const match = {};

    if (req.isAdmin) {
      if (req.query.status) match.status = String(req.query.status).toUpperCase();
      if (req.query.classroom) {
        match.classroom = new mongoose.Types.ObjectId(req.query.classroom);
      }
      if (req.query.keyword) {
        const keyword = String(req.query.keyword).trim();
        match.$or = [
          { title: { $regex: keyword, $options: "i" } },
          { term: { $regex: keyword, $options: "i" } },
          { academicYear: { $regex: keyword, $options: "i" } },
        ];
      }
    } else if (req.userRole === "teacher") {
      const rooms = await Classroom.find({ teacher: req.user._id }).select("_id").lean();
      const ids = rooms.map((item) => item._id);
      if (!ids.length) {
        return res.json(
          ApiResponse({ docs: [], totalDocs: 0, totalPages: 0, page, limit }, "", true)
        );
      }
      match.classroom = { $in: ids };
      match.status = { $in: ["OPEN", "CLOSED", "PUBLISHED"] };
      if (req.query.status) {
        match.status = String(req.query.status).toUpperCase();
      }
    } else {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }

    const aggregate = Exam.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "classrooms",
          localField: "classroom",
          foreignField: "_id",
          as: "classroom",
        },
      },
      { $unwind: { path: "$classroom", preserveNullAndEmptyArrays: true } },
    ]);

    const result = await Exam.aggregatePaginate(aggregate, { page, limit });
    const examIds = (result.docs || []).map((doc) => doc._id);
    const markCounts = await StudentMark.aggregate([
      { $match: { exam: { $in: examIds } } },
      {
        $group: {
          _id: { exam: "$exam", children: "$children" },
          subjects: { $addToSet: "$subject" },
        },
      },
      {
        $group: {
          _id: "$_id.exam",
          studentsMarked: { $sum: 1 },
        },
      },
    ]);
    const countMap = new Map(markCounts.map((row) => [String(row._id), row.studentsMarked]));
    const studentTotals = await Children.aggregate([
      {
        $match: {
          classroom: { $in: (result.docs || []).map((doc) => doc.classroom?._id).filter(Boolean) },
          status: { $ne: "INACTIVE" },
        },
      },
      { $group: { _id: "$classroom", total: { $sum: 1 } } },
    ]);
    const rosterMap = new Map(studentTotals.map((row) => [String(row._id), row.total]));

    result.docs = (result.docs || []).map((doc) => ({
      ...doc,
      studentsMarked: countMap.get(String(doc._id)) || 0,
      studentsTotal: rosterMap.get(String(doc.classroom?._id)) || 0,
      subjectCount: (doc.subjects || []).length,
    }));

    return res.json(ApiResponse(result, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getExamById = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate("classroom", "classroomName classroomGrade classroomBatch teacher")
      .lean();
    if (!exam) {
      return res.json(ApiResponse({}, "Exam not found", false));
    }

    if (req.userRole === "teacher") {
      const allowed = await assertTeacherClassroom(req, exam.classroom?._id || exam.classroom);
      if (!allowed) {
        return res.status(403).json(ApiResponse({}, "Access denied", false));
      }
    } else if (!req.isAdmin && req.userRole !== "parent") {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }

    const classroomId = exam.classroom?._id || exam.classroom;
    const students = await Children.find({
      classroom: classroomId,
      status: { $ne: "INACTIVE" },
    })
      .select("firstName lastName rollNumber image classroom")
      .sort({ firstName: 1, lastName: 1 })
      .lean();

    const marks = await StudentMark.find({ exam: exam._id }).lean();
    const marksByChild = new Map();
    marks.forEach((row) => {
      const key = String(row.children);
      if (!marksByChild.has(key)) marksByChild.set(key, []);
      marksByChild.get(key).push(row);
    });

    const roster = students.map((child) => {
      const summary = summarizeChild(exam, marksByChild.get(String(child._id)) || []);
      return {
        child,
        ...summary,
      };
    });

    return res.json(
      ApiResponse(
        {
          exam,
          roster,
          canEditMarks: canEditMarks(exam, req),
          flow: {
            draft: "Admin sets subjects and max marks",
            open: "Teacher enters marks for the class",
            closed: "Admin reviews and locks entry",
            published: "Parents can view results",
          },
        },
        "",
        true
      )
    );
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.upsertMarks = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) {
      return res.json(ApiResponse({}, "Exam not found", false));
    }
    if (!canEditMarks(exam, req)) {
      return res
        .status(403)
        .json(
          ApiResponse(
            {},
            req.isAdmin
              ? "Published results are locked. Unpublish to edit."
              : "Marks can only be entered while the exam is open",
            false
          )
        );
    }

    if (req.userRole === "teacher") {
      const allowed = await assertTeacherClassroom(req, exam.classroom);
      if (!allowed) {
        return res.status(403).json(ApiResponse({}, "Access denied", false));
      }
    } else if (!req.isAdmin) {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }

    const subjectMap = new Map(
      (exam.subjects || []).map((item) => [String(item.name).toLowerCase(), item])
    );
    const rows = Array.isArray(req.body.marks) ? req.body.marks : [];
    if (!rows.length) {
      return res.status(400).json(ApiResponse({}, "No marks provided", false));
    }

    const role = req.isAdmin ? "ADMIN" : "TEACHER";
    let saved = 0;
    for (const row of rows) {
      const childId = row.childId || row.children;
      const subjectName = String(row.subject || "").trim();
      const subject = subjectMap.get(subjectName.toLowerCase());
      if (!childId || !subject) continue;

      const obtained = Number(row.obtained);
      if (Number.isNaN(obtained) || obtained < 0) continue;
      const capped = Math.min(obtained, Number(subject.maxMarks) || 100);

      await StudentMark.findOneAndUpdate(
        { exam: exam._id, children: childId, subject: subject.name },
        {
          $set: {
            obtained: capped,
            remarks: String(row.remarks || "").trim(),
            enteredBy: req.user._id,
            enteredByRole: role,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }

    return res.json(ApiResponse({ saved }, `Saved ${saved} mark${saved === 1 ? "" : "s"}`, true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getPublishedByChild = async (req, res) => {
  try {
    const childId = req.params.childId;
    const child = await Children.findById(childId).select("parent classroom firstName lastName").lean();
    if (!child) {
      return res.json(ApiResponse({}, "Child not found", false));
    }
    if (req.userRole === "parent" && String(child.parent) !== String(req.user._id)) {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }
    if (req.userRole === "teacher") {
      const ownClass = req.user.classroom && (req.user.classroom._id || req.user.classroom);
      if (!ownClass || String(ownClass) !== String(child.classroom)) {
        return res.status(403).json(ApiResponse({}, "Access denied", false));
      }
    }

    const exams = await Exam.find({
      classroom: child.classroom,
      status: "PUBLISHED",
    })
      .sort({ publishedAt: -1, examDate: -1 })
      .lean();

    const examIds = exams.map((item) => item._id);
    const marks = await StudentMark.find({
      exam: { $in: examIds },
      children: childId,
    }).lean();
    const marksByExam = new Map();
    marks.forEach((row) => {
      const key = String(row.exam);
      if (!marksByExam.has(key)) marksByExam.set(key, []);
      marksByExam.get(key).push(row);
    });

    const docs = exams.map((exam) => {
      const summary = summarizeChild(exam, marksByExam.get(String(exam._id)) || []);
      return {
        exam: {
          _id: exam._id,
          title: exam.title,
          term: exam.term,
          academicYear: exam.academicYear,
          examDate: exam.examDate,
          publishedAt: exam.publishedAt,
          subjects: exam.subjects,
        },
        ...summary,
      };
    });

    return res.json(ApiResponse({ docs, child }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getPublishedExamForChild = async (req, res) => {
  try {
    const childId = req.query.childId || req.params.childId;
    const exam = await Exam.findById(req.params.id).lean();
    if (!exam || exam.status !== "PUBLISHED") {
      return res.json(ApiResponse({}, "Published result not found", false));
    }
    const child = await Children.findById(childId)
      .select("parent classroom firstName lastName rollNumber image")
      .lean();
    if (!child) {
      return res.json(ApiResponse({}, "Child not found", false));
    }
    if (req.userRole === "parent" && String(child.parent) !== String(req.user._id)) {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }
    if (req.userRole === "teacher") {
      const ownClass = req.user.classroom && (req.user.classroom._id || req.user.classroom);
      if (!ownClass || String(ownClass) !== String(child.classroom)) {
        return res.status(403).json(ApiResponse({}, "Access denied", false));
      }
    }
    if (String(child.classroom) !== String(exam.classroom)) {
      return res.status(400).json(ApiResponse({}, "Child is not in this exam class", false));
    }

    const marks = await StudentMark.find({ exam: exam._id, children: childId }).lean();
    const summary = summarizeChild(exam, marks);
    return res.json(ApiResponse({ exam, child, ...summary }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.letterGrade = letterGrade;
exports.summarizeChild = summarizeChild;
