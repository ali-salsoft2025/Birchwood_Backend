const SchoolSettings = require("../../Models/SchoolSettings");
const TeacherAttendance = require("../../Models/TeacherAttendance");
const Teacher = require("../../Models/Teacher");
const { ApiResponse } = require("../../Helpers/index");
const {
  describeTeacherRules,
  clockToMinutes,
  normalizeTeacherRules,
} = require("../../Helpers/teacherDay");
const { DEFAULT_SCHOOL_TIME_ZONE, isValidTimeZone } = require("../../Helpers/schoolDay");

const TOGGLEABLE = [
  "fees",
  "gallery",
  "ads",
  "chat",
  "results",
  "assessments",
  "register",
  "notifications",
];

exports.getModules = async (req, res) => {
  try {
    const modules = await SchoolSettings.getModules();
    return res.json(ApiResponse({ modules }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.updateModules = async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json(ApiResponse({}, "Only admin can update modules", false));
    }
    const doc = await SchoolSettings.getSingleton();
    const incoming = req.body?.modules || req.body || {};
    const previous = await SchoolSettings.getModules();
    TOGGLEABLE.forEach((key) => {
      if (typeof incoming[key] !== "boolean") {
        return;
      }
      doc.modules[key] = incoming[key];
      if (incoming[key] === previous[key]) {
        return;
      }
      (SchoolSettings.LINKED_MODULES || []).forEach((group) => {
        if (!group.includes(key)) {
          return;
        }
        group.forEach((linked) => {
          doc.modules[linked] = incoming[key];
        });
      });
    });
    doc.markModified("modules");
    await doc.save();
    const modules = await SchoolSettings.getModules();
    return res.json(ApiResponse({ modules }, "Module settings saved", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getTeacherRules = async (req, res) => {
  try {
    const doc = await SchoolSettings.getSingleton();
    const timeZone = isValidTimeZone(doc.timeZone) ? doc.timeZone : DEFAULT_SCHOOL_TIME_ZONE;
    const rules = { ...describeTeacherRules(doc.teacherAttendance || {}), timeZone };
    return res.json(ApiResponse({ rules }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.updateTeacherRules = async (req, res) => {
  try {
    const body = req.body || {};
    const checkInMinutes = clockToMinutes(body.checkInClock);
    const checkOutMinutes = clockToMinutes(body.checkOutClock);
    if (checkInMinutes == null || checkOutMinutes == null) {
      return res.status(400).json(ApiResponse({}, "Enter check-in and check-out as HH:MM", false));
    }
    const next = normalizeTeacherRules({
      checkInMinutes,
      graceMinutes: body.graceMinutes,
      checkOutMinutes,
      leaveQuota: body.leaveQuota,
    });
    if (next.checkOutMinutes <= next.checkInMinutes) {
      return res.status(400).json(ApiResponse({}, "Check-out must be after check-in", false));
    }
    const doc = await SchoolSettings.getSingleton();
    const timeZone = isValidTimeZone(body.timeZone)
      ? body.timeZone
      : isValidTimeZone(doc.timeZone)
        ? doc.timeZone
        : DEFAULT_SCHOOL_TIME_ZONE;
    doc.timeZone = timeZone;
    doc.teacherAttendance = next;
    await doc.save();
    return res.json(
      ApiResponse(
        { rules: { ...describeTeacherRules(doc.teacherAttendance), timeZone } },
        "Teacher attendance rules saved",
        true
      )
    );
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getPendingTeacherLeaves = async (req, res) => {
  try {
    const leaves = await TeacherAttendance.find({ leaveStatus: "PENDING" })
      .sort({ checkIn: 1 })
      .populate("teacher", "firstName lastName")
      .lean();
    return res.json(ApiResponse({ leaves }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.reviewTeacherLeave = async (req, res) => {
  try {
    const decision = String(req.body?.decision || "").toUpperCase();
    if (!["APPROVED", "REJECTED"].includes(decision)) {
      return res.status(400).json(ApiResponse({}, "Decision must be approved or rejected", false));
    }
    const record = await TeacherAttendance.findById(req.params.id);
    if (!record || record.leaveStatus !== "PENDING") {
      return res.status(404).json(ApiResponse({}, "Pending leave not found", false));
    }
    record.leaveStatus = decision;
    record.status = decision === "APPROVED" ? "LEAVE" : "ABSENT";
    await record.save();
    const teacher = await Teacher.findById(record.teacher);
    if (teacher) {
      teacher.checkIn = true;
      await teacher.save();
    }
    return res.json(
      ApiResponse(
        { leave: record },
        decision === "APPROVED" ? "Leave approved" : "Leave rejected. That day is now absent",
        true
      )
    );
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};
