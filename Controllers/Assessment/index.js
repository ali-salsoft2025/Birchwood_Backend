const Assessment = require("../../Models/Assessment");
const AssessmentMark = require("../../Models/AssessmentMark");
const Children = require("../../Models/Children");
const Classroom = require("../../Models/Classroom");
const SchoolSettings = require("../../Models/SchoolSettings");
const { ApiResponse } = require("../../Helpers/index");
const { letterGrade } = require("../Result");

async function assertAssessmentsEnabled() {
  const modules = await SchoolSettings.getModules();
  return modules.assessments !== false;
}

async function teacherOwnsClassroom(req, classroomId) {
  if (req.isAdmin) return true;
  if (req.userRole !== "teacher") return false;
  const room = await Classroom.findById(classroomId).select("teacher").lean();
  return room && String(room.teacher) === String(req.user._id);
}

function summarize(assessment, mark) {
  const maxMarks = Number(assessment.maxMarks) || 100;
  const obtained = mark ? Number(mark.obtained) : null;
  const percentage =
    obtained == null ? null : Math.round((obtained / maxMarks) * 1000) / 10;
  return {
    obtained,
    maxMarks,
    percentage,
    grade: percentage == null ? null : letterGrade(percentage),
    remarks: mark?.remarks || "",
  };
}

exports.createAssessment = async (req, res) => {
  try {
    if (!(await assertAssessmentsEnabled())) {
      return res.status(403).json(ApiResponse({}, "Tests are turned off", false));
    }
    if (req.userRole !== "teacher" && !req.isAdmin) {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }
    const title = String(req.body.title || "").trim();
    const subject = String(req.body.subject || "").trim();
    const classroom = req.body.classroom;
    const maxMarks = Math.max(1, Number(req.body.maxMarks) || 100);
    const kindRaw = String(req.body.kind || "TEST").toUpperCase();
    const kind = Assessment.KINDS.includes(kindRaw) ? kindRaw : "TEST";
    if (!title || !classroom) {
      return res.status(400).json(ApiResponse({}, "Title and class are required", false));
    }
    if (!(await teacherOwnsClassroom(req, classroom))) {
      return res.status(403).json(ApiResponse({}, "Not your classroom", false));
    }

    const assessment = await Assessment.create({
      title,
      kind,
      subject,
      notes: String(req.body.notes || "").trim(),
      classroom,
      maxMarks,
      assessmentDate: req.body.assessmentDate ? new Date(req.body.assessmentDate) : new Date(),
      teacher: req.isAdmin ? req.body.teacher || null : req.user._id,
      status: "DRAFT",
    });

    return res
      .status(201)
      .json(ApiResponse({ assessment }, "Created", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.updateAssessment = async (req, res) => {
  try {
    if (!(await assertAssessmentsEnabled())) {
      return res.status(403).json(ApiResponse({}, "Tests are turned off", false));
    }
    const assessment = await Assessment.findById(req.params.id);
    if (!assessment) {
      return res.json(ApiResponse({}, "Assessment not found", false));
    }
    if (!(await teacherOwnsClassroom(req, assessment.classroom))) {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }
    if (assessment.status === "PUBLISHED" && !req.isAdmin) {
      return res.status(400).json(ApiResponse({}, "Unpublish before editing", false));
    }
    ["title", "subject", "notes"].forEach((key) => {
      if (req.body[key] != null) assessment[key] = String(req.body[key]).trim();
    });
    if (req.body.kind != null) {
      const kindRaw = String(req.body.kind).toUpperCase();
      if (Assessment.KINDS.includes(kindRaw)) assessment.kind = kindRaw;
    }
    if (req.body.maxMarks) assessment.maxMarks = Math.max(1, Number(req.body.maxMarks) || 100);
    if (req.body.assessmentDate) assessment.assessmentDate = new Date(req.body.assessmentDate);
    await assessment.save();
    return res.json(ApiResponse({ assessment }, "Assessment updated", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.setAssessmentStatus = async (req, res) => {
  try {
    if (!(await assertAssessmentsEnabled())) {
      return res.status(403).json(ApiResponse({}, "Tests are turned off", false));
    }
    const assessment = await Assessment.findById(req.params.id);
    if (!assessment) {
      return res.json(ApiResponse({}, "Assessment not found", false));
    }
    if (!(await teacherOwnsClassroom(req, assessment.classroom))) {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }
    const next = String(req.body.status || "").toUpperCase();
    if (!["DRAFT", "PUBLISHED"].includes(next)) {
      return res.status(400).json(ApiResponse({}, "Invalid status", false));
    }
    assessment.status = next;
    assessment.publishedAt = next === "PUBLISHED" ? new Date() : null;
    await assessment.save();
    return res.json(
      ApiResponse(
        { assessment },
        next === "PUBLISHED" ? "Published to parents" : "Moved back to draft",
        true
      )
    );
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.deleteAssessment = async (req, res) => {
  try {
    const assessment = await Assessment.findById(req.params.id);
    if (!assessment) {
      return res.json(ApiResponse({}, "Assessment not found", false));
    }
    if (!(await teacherOwnsClassroom(req, assessment.classroom))) {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }
    await AssessmentMark.deleteMany({ assessment: assessment._id });
    await assessment.deleteOne();
    return res.json(ApiResponse({}, "Assessment deleted", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getMyAssessments = async (req, res) => {
  try {
    if (!(await assertAssessmentsEnabled())) {
      return res.json(ApiResponse({ docs: [] }, "Tests are turned off", true));
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const match = {};

    if (req.userRole === "teacher") {
      const rooms = await Classroom.find({ teacher: req.user._id }).select("_id").lean();
      match.classroom = { $in: rooms.map((r) => r._id) };
    } else if (!req.isAdmin) {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }

    if (req.query.status) match.status = String(req.query.status).toUpperCase();

    const aggregate = Assessment.aggregate([
      { $match: match },
      { $sort: { assessmentDate: -1, createdAt: -1 } },
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
    const result = await Assessment.aggregatePaginate(aggregate, { page, limit });
    return res.json(ApiResponse(result, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getAssessmentById = async (req, res) => {
  try {
    const assessment = await Assessment.findById(req.params.id)
      .populate("classroom", "classroomName classroomGrade teacher")
      .lean();
    if (!assessment) {
      return res.json(ApiResponse({}, "Assessment not found", false));
    }
    if (!(await teacherOwnsClassroom(req, assessment.classroom?._id || assessment.classroom))) {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }

    const students = await Children.find({
      classroom: assessment.classroom?._id || assessment.classroom,
      status: { $ne: "INACTIVE" },
    })
      .select("firstName lastName rollNumber")
      .sort({ firstName: 1 })
      .lean();

    const marks = await AssessmentMark.find({ assessment: assessment._id }).lean();
    const byChild = new Map(marks.map((m) => [String(m.children), m]));
    const roster = students.map((child) => ({
      child,
      ...summarize(assessment, byChild.get(String(child._id))),
    }));

    return res.json(
      ApiResponse(
        {
          assessment,
          roster,
          canEdit: assessment.status !== "PUBLISHED" || req.isAdmin,
        },
        "",
        true
      )
    );
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.upsertAssessmentMarks = async (req, res) => {
  try {
    if (!(await assertAssessmentsEnabled())) {
      return res.status(403).json(ApiResponse({}, "Tests are turned off", false));
    }
    const assessment = await Assessment.findById(req.params.id);
    if (!assessment) {
      return res.json(ApiResponse({}, "Assessment not found", false));
    }
    if (!(await teacherOwnsClassroom(req, assessment.classroom))) {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }
    if (assessment.status === "PUBLISHED" && !req.isAdmin) {
      return res.status(400).json(ApiResponse({}, "Unpublish before editing marks", false));
    }

    const rows = Array.isArray(req.body.marks) ? req.body.marks : [];
    let saved = 0;
    for (const row of rows) {
      const childId = row.childId || row.children;
      const obtained = Number(row.obtained);
      if (!childId || Number.isNaN(obtained) || obtained < 0) continue;
      await AssessmentMark.findOneAndUpdate(
        { assessment: assessment._id, children: childId },
        {
          $set: {
            obtained: Math.min(obtained, assessment.maxMarks),
            remarks: String(row.remarks || "").trim(),
            enteredBy: req.user._id,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }
    return res.json(ApiResponse({ saved }, `Saved ${saved} mark(s)`, true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getPublishedByChild = async (req, res) => {
  try {
    if (!(await assertAssessmentsEnabled())) {
      return res.json(ApiResponse({ docs: [] }, "", true));
    }
    const child = await Children.findById(req.params.childId)
      .select("parent classroom firstName lastName")
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

    const assessments = await Assessment.find({
      classroom: child.classroom,
      status: "PUBLISHED",
    })
      .sort({ publishedAt: -1, assessmentDate: -1 })
      .lean();

    const ids = assessments.map((a) => a._id);
    const marks = await AssessmentMark.find({
      assessment: { $in: ids },
      children: child._id,
    }).lean();
    const byAssessment = new Map(marks.map((m) => [String(m.assessment), m]));

    const docs = assessments.map((assessment) => ({
      assessment: {
        _id: assessment._id,
        title: assessment.title,
        kind: assessment.kind || "TEST",
        subject: assessment.subject,
        notes: assessment.notes,
        assessmentDate: assessment.assessmentDate,
        publishedAt: assessment.publishedAt,
        maxMarks: assessment.maxMarks,
      },
      ...summarize(assessment, byAssessment.get(String(assessment._id))),
    }));

    return res.json(ApiResponse({ docs, child }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};
