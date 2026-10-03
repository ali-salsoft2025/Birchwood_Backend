const Attendance = require("../../Models/Attendance");
const Children = require("../../Models/Children");
const SchoolSettings = require("../../Models/SchoolSettings");
const { ApiResponse } = require("../../Helpers/index");
const {
  DEFAULT_SCHOOL_TIME_ZONE,
  isValidTimeZone,
  schoolMonthBounds,
  schoolDayBounds,
  schoolParts,
  zonedWallTime,
  CHECKIN_ON_TIME_END_MINUTES,
} = require("../../Helpers/schoolDay");

async function schoolZone() {
  const doc = await SchoolSettings.getSingleton();
  return isValidTimeZone(doc.timeZone) ? doc.timeZone : DEFAULT_SCHOOL_TIME_ZONE;
}

function wallStamp(schoolDate, clock, timeZone) {
  const match = String(schoolDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const time = String(clock || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match || !time) return null;
  const hours = Number(time[1]);
  const minutes = Number(time[2]);
  if (hours > 23 || minutes > 59) return null;
  return zonedWallTime(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    hours,
    minutes,
    timeZone
  );
}

function readLate(value, stamp, status) {
  if (status !== "PRESENT") return false;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  if (!stamp) return false;
  const parts = schoolParts(stamp);
  return parts.hours * 60 + parts.minutes > CHECKIN_ON_TIME_END_MINUTES;
}

async function syncTodayFlag(childId, attendance) {
  if (!attendance?.checkIn) return;
  const { start, end } = schoolDayBounds(new Date());
  if (attendance.checkIn < start || attendance.checkIn > end) return;
  await Children.updateOne(
    { _id: childId },
    { checkIn: attendance.status === "PRESENT" && !attendance.checkOut }
  );
}

exports.getAttendanceByMonth = async (req, res) => {
  try {
    const timeZone = await schoolZone();
    const schoolNow = schoolParts(new Date(), timeZone);
    const month = parseInt(req.query.month || schoolNow.month + 1, 10);
    const year = parseInt(req.query.year || schoolNow.year, 10);
    const { start, end } = schoolMonthBounds(year, month, timeZone);
    const attendance = await Attendance.find({
      children: req.params.id,
      checkIn: { $gte: start, $lte: end },
    }).sort({ checkIn: 1 });
    return res.json(ApiResponse({ attendance, timeZone }, "Attendance fetched successfully", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.markAttendance = async (req, res) => {
  try {
    const child = await Children.findById(req.params.id);
    if (!child) return res.json(ApiResponse({}, "Student not found", false));
    const { status, leaveReason, schoolDate, checkInClock, checkOutClock, late } = req.body;
    const timeZone = await schoolZone();
    const savedStatus = status || "PRESENT";
    const checkInAt = wallStamp(schoolDate, savedStatus === "PRESENT" ? checkInClock : checkInClock || "00:00", timeZone);
    if (!checkInAt) return res.json(ApiResponse({}, "A valid time is required", false));
    const checkOutAt = savedStatus === "PRESENT" ? wallStamp(schoolDate, checkOutClock, timeZone) : null;
    if (checkOutAt && checkOutAt < checkInAt) {
      return res.json(ApiResponse({}, "Check-out must be after check-in", false));
    }
    const attendance = await Attendance.create({
      children: child._id,
      classroom: child.classroom || undefined,
      status: savedStatus,
      checkIn: checkInAt,
      checkOut: checkOutAt,
      leaveReason: leaveReason || "",
      late: readLate(late, checkInAt, savedStatus),
      markedBy: "ADMIN",
    });
    await syncTodayFlag(child._id, attendance);
    return res.json(ApiResponse({ attendance }, "Attendance added successfully", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.updateAttendance = async (req, res) => {
  try {
    const { status, leaveReason, schoolDate, checkInClock, checkOutClock, late } = req.body;
    const timeZone = await schoolZone();
    const existing = await Attendance.findById(req.params.id);
    if (!existing) return res.json(ApiResponse({}, "Attendance not found", false));
    const checkInAt = wallStamp(schoolDate, status === "PRESENT" ? checkInClock : checkInClock || "00:00", timeZone);
    if (!checkInAt) return res.json(ApiResponse({}, "A valid time is required", false));
    const checkOutAt = status === "PRESENT" ? wallStamp(schoolDate, checkOutClock, timeZone) : null;
    if (checkOutAt && checkOutAt < checkInAt) {
      return res.json(ApiResponse({}, "Check-out must be after check-in", false));
    }
    existing.status = status;
    existing.checkIn = checkInAt;
    existing.checkOut = checkOutAt;
    existing.leaveReason = leaveReason || "";
    existing.late = readLate(late, checkInAt, status);
    existing.markedBy = "ADMIN";
    if (status !== "PRESENT") {
      existing.earlyPickup = false;
      existing.pickupReason = "";
    }
    await existing.save();
    if (existing.children) await syncTodayFlag(existing.children, existing);
    return res.json(ApiResponse({ attendance: existing }, "Attendance updated successfully", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.deleteAttendance = async (req, res) => {
  try {
    const attendance = await Attendance.findByIdAndDelete(req.params.id);
    if (!attendance) return res.json(ApiResponse({}, "Attendance not found", false));
    if (attendance.children && attendance.status === "PRESENT") {
      const { start, end } = schoolDayBounds(new Date());
      if (attendance.checkIn >= start && attendance.checkIn <= end) {
        await Children.updateOne({ _id: attendance.children }, { checkIn: false });
      }
    }
    return res.json(ApiResponse({}, "Attendance deleted successfully", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};
