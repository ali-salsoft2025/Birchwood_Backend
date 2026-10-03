const SchoolSettings = require("../../Models/SchoolSettings");
const TeacherDutyDay = require("../../Models/TeacherDutyDay");
const TeacherAttendance = require("../../Models/TeacherAttendance");
const Teacher = require("../../Models/Teacher");
const { ApiResponse } = require("../../Helpers/index");
const {
  describeTeacherRules,
  clockToMinutes,
  normalizeTeacherRules,
} = require("../../Helpers/teacherDay");
const { DEFAULT_SCHOOL_TIME_ZONE, isValidTimeZone, formatClock } = require("../../Helpers/schoolDay");
const { minutesToClockInput } = require("../../Helpers/teacherDay");
const { createAdminNotification } = require("../../Helpers/notification");

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

function cleanAppText(value, max) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function appInfoPayload(doc) {
  const info = doc?.appInfo || {};
  return {
    teacherVersion: info.teacherVersion || "",
    parentVersion: info.parentVersion || "",
    privacyPolicy: info.privacyPolicy || "",
    termsOfUse: info.termsOfUse || "",
  };
}

exports.getAppInfo = async (req, res) => {
  try {
    const doc = await SchoolSettings.getSingleton();
    return res.json(ApiResponse({ appInfo: appInfoPayload(doc) }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.updateAppInfo = async (req, res) => {
  try {
    const body = req.body || {};
    const doc = await SchoolSettings.getSingleton();
    doc.appInfo = {
      teacherVersion: cleanAppText(body.teacherVersion, 40),
      parentVersion: cleanAppText(body.parentVersion, 40),
      privacyPolicy: cleanAppText(body.privacyPolicy, 20000),
      termsOfUse: cleanAppText(body.termsOfUse, 20000),
    };
    doc.markModified("appInfo");
    await doc.save();
    return res.json(ApiResponse({ appInfo: appInfoPayload(doc) }, "App information saved", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

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

function prettyDay(key) {
  const [year, month, day] = String(key || "").split("-").map(Number);
  if (!year || !month || !day) return key;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function notifyTeachersOfOpenDay(day) {
  const when =
    day.startKey === day.endKey
      ? prettyDay(day.startKey)
      : `${prettyDay(day.startKey)} to ${prettyDay(day.endKey)}`;
  const checkIn = formatClock(day.checkInMinutes);
  const checkOut = formatClock(day.checkOutMinutes);
  await createAdminNotification({
    title: "Open day for teachers",
    content: `${day.name || "Open day"}: ${when} is open for all teachers. Check in at ${checkIn} and check out at ${checkOut}.`,
    type: "ANNOUNCEMENT",
    sendTo: "TEACHERS",
  });
}

function dutyPayload(day) {
  return {
    ...day,
    checkInClock: minutesToClockInput(day.checkInMinutes),
    checkOutClock: minutesToClockInput(day.checkOutMinutes),
    checkInLabel: formatClock(day.checkInMinutes),
    checkOutLabel: formatClock(day.checkOutMinutes),
  };
}

exports.listOpenDays = async (req, res) => {
  try {
    const days = await TeacherDutyDay.find().sort({ startKey: 1 }).lean();
    return res.json(
      ApiResponse(
        {
          days: days.map((day) => ({
            name: day.name || "Special day",
            startKey: day.startKey,
            endKey: day.endKey || day.startKey,
          })),
        },
        "",
        true
      )
    );
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.listTeacherDutyDays = async (req, res) => {
  try {
    const days = await TeacherDutyDay.find().sort({ startKey: 1 }).lean();
    return res.json(ApiResponse({ days: days.map(dutyPayload) }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.saveTeacherDutyDay = async (req, res) => {
  try {
    const body = req.body || {};
    const startKey = String(body.startKey || "").trim();
    const endKey = String(body.endKey || startKey).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startKey) || !/^\d{4}-\d{2}-\d{2}$/.test(endKey) || endKey < startKey) {
      return res.status(400).json(ApiResponse({}, "Choose a valid date", false));
    }
    const checkInMinutes = clockToMinutes(body.checkInClock);
    const checkOutMinutes = clockToMinutes(body.checkOutClock);
    if (checkInMinutes == null || checkOutMinutes == null) {
      return res.status(400).json(ApiResponse({}, "Enter check-in and check-out as HH:MM", false));
    }
    if (checkOutMinutes <= checkInMinutes) {
      return res.status(400).json(ApiResponse({}, "Check-out must be after check-in", false));
    }
    const payload = {
      name: String(body.name || "Open weekend").trim() || "Open weekend",
      startKey,
      endKey,
      checkInMinutes,
      checkOutMinutes,
    };
    const day = body.id
      ? await TeacherDutyDay.findByIdAndUpdate(body.id, payload, { new: true }).lean()
      : (await TeacherDutyDay.create(payload)).toObject();
    if (!day) {
      return res.status(404).json(ApiResponse({}, "Special day not found", false));
    }
    let noticeSent = false;
    try {
      await notifyTeachersOfOpenDay(day);
      noticeSent = true;
    } catch (noticeError) {
      console.error("Open day notice failed:", noticeError.message);
    }
    return res.json(
      ApiResponse(
        { day: dutyPayload(day), noticeSent },
        noticeSent
          ? "Open day saved. Teachers were sent a notice."
          : "Open day saved. The teacher notice could not be sent.",
        true
      )
    );
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.deleteTeacherDutyDay = async (req, res) => {
  try {
    const day = await TeacherDutyDay.findByIdAndDelete(req.params.id);
    if (!day) {
      return res.status(404).json(ApiResponse({}, "Special day not found", false));
    }
    return res.json(ApiResponse({}, "Special day removed", true));
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
