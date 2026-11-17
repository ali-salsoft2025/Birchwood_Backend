const Attendance = require("../Models/Attendance");
const TeacherAttendance = require("../Models/TeacherAttendance");
const Teacher = require("../Models/Teacher");
const SchoolSettings = require("../Models/SchoolSettings");
const {
  attendanceWindow,
  isSchoolWeekday,
  schoolDayBounds,
  schoolParts,
  zonedWallTime,
  DEFAULT_SCHOOL_TIME_ZONE,
  isValidTimeZone,
} = require("./schoolDay");
const { describeTeacherRules, teacherShiftClosed } = require("./teacherDay");
const { dateKey, resolveTeacherDay } = require("./teacherWorkDay");

function plainChild(child) {
  return child && child.toObject ? child.toObject() : child;
}

async function loadTodayRecords(childIds, start, end) {
  if (!childIds.length) return [];
  return Attendance.find({
    children: { $in: childIds },
    checkIn: { $gte: start, $lte: end },
  }).lean();
}

/** After the on-time window, a school day with no mark is stored as absent. */
async function attachTodayAttendance(children, date = new Date()) {
  const list = (children || []).map(plainChild).filter((child) => child && child._id);
  if (!list.length) return [];

  const now = date;
  const { start, end } = schoolDayBounds(now);
  const ids = list.map((child) => child._id);
  let records = await loadTodayRecords(ids, start, end);
  const byChild = new Map(records.map((record) => [String(record.children), record]));
  const window = attendanceWindow(now);

  const { studentsClosedForDuty } = require("./teacherWorkDay");
  const studentsClosed = await studentsClosedForDuty(now);
  if (isSchoolWeekday(now) && window.late && !studentsClosed) {
    const missing = list.filter((child) => !byChild.has(String(child._id)));
    if (missing.length) {
      await Promise.all(
        missing.map((child) =>
          Attendance.findOneAndUpdate(
            { children: child._id, checkIn: { $gte: start, $lte: end } },
            {
              $setOnInsert: {
                children: child._id,
                classroom: child.classroom?._id || child.classroom || undefined,
                checkIn: start,
                status: "ABSENT",
                late: false,
                markedBy: "ADMIN",
              },
            },
            { upsert: true, new: true }
          )
        )
      );
      records = await loadTodayRecords(ids, start, end);
      byChild.clear();
      records.forEach((record) => byChild.set(String(record.children), record));
    }
  }

  return list.map((child) => ({
    ...child,
    todayAttendance: byChild.get(String(child._id)) || null,
  }));
}

async function loadTeacherClock() {
  const doc = await SchoolSettings.getSingleton();
  const timeZone = isValidTimeZone(doc.timeZone) ? doc.timeZone : DEFAULT_SCHOOL_TIME_ZONE;
  return { timeZone, rules: describeTeacherRules(doc.teacherAttendance || {}) };
}

function noonOn(parts, dayOffset, timeZone) {
  return zonedWallTime(parts.year, parts.month, parts.date + dayOffset, 12, 0, timeZone);
}

function noonsBetween(from, to, timeZone) {
  const startParts = schoolParts(from, timeZone);
  const endParts = schoolParts(to, timeZone);
  const days = [];
  let cursor = zonedWallTime(startParts.year, startParts.month, startParts.date, 12, 0, timeZone);
  const last = zonedWallTime(endParts.year, endParts.month, endParts.date, 12, 0, timeZone).getTime();
  while (cursor.getTime() <= last && days.length < 40) {
    days.push(cursor);
    const parts = schoolParts(cursor, timeZone);
    cursor = zonedWallTime(parts.year, parts.month, parts.date + 1, 12, 0, timeZone);
  }
  return days;
}

async function ensureTeacherAbsent(teacherId, day, timeZone, date = new Date(), now = new Date()) {
  const { start, end } = schoolDayBounds(date, timeZone);
  let record = await TeacherAttendance.findOne({
    teacher: teacherId,
    checkIn: { $gte: start, $lte: end },
  });
  if (record || !teacherShiftClosed(day, dateKey(now, timeZone))) return record;
  record = await TeacherAttendance.findOneAndUpdate(
    { teacher: teacherId, checkIn: { $gte: start, $lte: end } },
    {
      $setOnInsert: {
        teacher: teacherId,
        checkIn: start,
        status: "ABSENT",
        late: false,
      },
    },
    { upsert: true, new: true }
  );
  return record;
}

/**
 * Store ABSENT for active teachers who never checked in or applied leave
 * on a work day that has already closed (checkout time, or a past school day).
 */
async function closeUnmarkedTeacherDays(now = new Date(), options = {}) {
  const { timeZone, rules } = await loadTeacherClock();
  const todayKey = dateKey(now, timeZone);
  const probes = (options.from && options.to
    ? noonsBetween(options.from, options.to, timeZone)
    : Array.from({ length: (options.lookbackDays || 0) + 1 }, (_, index) => {
        const parts = schoolParts(now, timeZone);
        return noonOn(parts, -index, timeZone);
      })
  ).map((probe) => (dateKey(probe, timeZone) === todayKey ? now : probe));

  const teacherQuery = { status: "ACTIVE" };
  if (options.teacherId) teacherQuery._id = options.teacherId;
  const teachers = await Teacher.find(teacherQuery).select("_id createdAt").lean();
  if (!teachers.length) return { marked: 0 };

  let marked = 0;
  for (const probe of probes) {
    if (dateKey(probe, timeZone) > todayKey) continue;
    const day = await resolveTeacherDay(probe, rules, timeZone);
    if (!teacherShiftClosed(day, todayKey)) continue;
    const { start, end } = schoolDayBounds(probe, timeZone);
    const eligible = teachers.filter(
      (teacher) => !teacher.createdAt || new Date(teacher.createdAt).getTime() <= end.getTime()
    );
    if (!eligible.length) continue;
    const existing = await TeacherAttendance.find({
      teacher: { $in: eligible.map((teacher) => teacher._id) },
      checkIn: { $gte: start, $lte: end },
    }).select("teacher").lean();
    const have = new Set(existing.map((row) => String(row.teacher)));
    const missing = eligible.filter((teacher) => !have.has(String(teacher._id)));
    if (!missing.length) continue;
    await TeacherAttendance.insertMany(
      missing.map((teacher) => ({
        teacher: teacher._id,
        checkIn: start,
        status: "ABSENT",
        late: false,
      })),
      { ordered: false }
    );
    marked += missing.length;
  }
  return { marked };
}

module.exports = {
  attachTodayAttendance,
  ensureTeacherAbsent,
  closeUnmarkedTeacherDays,
};
