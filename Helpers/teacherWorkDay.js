const Holiday = require("../Models/Holiday");
const TeacherDutyDay = require("../Models/TeacherDutyDay");
const { schoolParts } = require("./schoolDay");
const { teacherDayPlan, describeTeacherRules } = require("./teacherDay");

function dateKey(date, timeZone) {
  const parts = schoolParts(date, timeZone);
  const month = String(parts.month + 1).padStart(2, "0");
  const day = String(parts.date).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

function covers(startKey, endKey, key) {
  const start = String(startKey || "");
  const end = String(endKey || start);
  return Boolean(start) && start <= key && key <= end;
}

async function dutyForKey(key) {
  const duties = await TeacherDutyDay.find({ startKey: { $lte: key }, endKey: { $gte: key } })
    .sort({ startKey: 1 })
    .lean();
  return duties[0] || null;
}

async function teacherHolidayForKey(key, timeZone) {
  const holidays = await Holiday.find({
    type: "HOLIDAY",
    audience: { $in: ["TEACHER", "BOTH"] },
  }).lean();
  return (
    holidays.find((holiday) =>
      covers(dateKey(holiday.date, timeZone), holiday.endDate ? dateKey(holiday.endDate, timeZone) : dateKey(holiday.date, timeZone), key)
    ) || null
  );
}

async function resolveTeacherDay(date, rules, timeZone) {
  const key = dateKey(date, timeZone);
  const parts = schoolParts(date, timeZone);
  const [duty, teacherHoliday] = await Promise.all([
    dutyForKey(key),
    teacherHolidayForKey(key, timeZone),
  ]);
  const plan = teacherDayPlan({
    weekday: parts.weekday,
    duty,
    teacherHoliday,
    rules,
    date,
    timeZone,
  });
  return {
    ...plan,
    key,
    described: describeTeacherRules(plan.rules),
  };
}

async function studentsClosedForDuty(date, timeZone) {
  const key = dateKey(date, timeZone);
  const duty = await dutyForKey(key);
  return Boolean(duty);
}

module.exports = {
  dateKey,
  covers,
  dutyForKey,
  resolveTeacherDay,
  studentsClosedForDuty,
};
