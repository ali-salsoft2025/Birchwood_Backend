const Attendance = require("../Models/Attendance");
const TeacherAttendance = require("../Models/TeacherAttendance");
const {
  attendanceWindow,
  isSchoolWeekday,
  schoolDayBounds,
} = require("./schoolDay");

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

async function ensureTeacherAbsent(teacherId, day, timeZone, date = new Date()) {
  const { start, end } = schoolDayBounds(date, timeZone);
  let record = await TeacherAttendance.findOne({
    teacher: teacherId,
    checkIn: { $gte: start, $lte: end },
  });
  if (record || day?.off || !day?.punch?.late) return record;
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

module.exports = {
  attachTodayAttendance,
  ensureTeacherAbsent,
};
