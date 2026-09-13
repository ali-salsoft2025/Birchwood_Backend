require("../config/loadEnv");
const mongoose = require("mongoose");
const moment = require("moment");
const Teacher = require("../Models/Teacher");
const TeacherAttendance = require("../Models/TeacherAttendance");

const LEAVE_REASONS = [
  "Family event",
  "Medical appointment",
  "Personal leave",
  "Training day",
];

function buildRecord(teacherId, day, status, extra = {}) {
  const checkIn = day.clone().hour(8).minute(45).second(0).toDate();
  const checkOut = day.clone().hour(16).minute(0).second(0).toDate();
  if (status === "PRESENT") {
    return { teacher: teacherId, status, checkIn, checkOut };
  }
  return {
    teacher: teacherId,
    status,
    checkIn: day.clone().hour(9).minute(0).second(0).toDate(),
    checkOut: day.clone().hour(9).minute(0).second(0).toDate(),
    ...extra,
  };
}

function statusForDay(teacherIndex, day) {
  const date = day.date();
  const mix = (teacherIndex * 3 + date) % 12;
  if (mix === 0) return { status: "ABSENT" };
  if (mix === 1) {
    return {
      status: "LEAVE",
      leaveReason: LEAVE_REASONS[(teacherIndex + date) % LEAVE_REASONS.length],
      leaveType: "CASUAL",
    };
  }
  if (date === 17 && teacherIndex === 0) {
    return { status: "HOLIDAY", leaveReason: "School holiday" };
  }
  return { status: "PRESENT" };
}

async function seedMonth(teachers, year, month) {
  const start = moment({ year, month: month - 1, day: 1 }).startOf("day");
  const end = start.clone().endOf("month");
  const today = moment().endOf("day");
  const records = [];

  for (let index = 0; index < teachers.length; index++) {
    const teacher = teachers[index];
    for (let day = start.clone(); day.isSameOrBefore(end); day.add(1, "day")) {
      if (day.day() === 0 || day.day() === 6) continue;
      if (day.isAfter(today)) continue;
      const pick = statusForDay(index, day);
      records.push(buildRecord(teacher._id, day, pick.status, pick));
    }
  }

  if (!records.length) return 0;
  await TeacherAttendance.insertMany(records);
  return records.length;
}

async function seedTeacherAttendance() {
  if (!process.env.DB) {
    throw new Error("DB is not set in .env");
  }

  const teachers = await Teacher.find({}).select("_id firstName lastName email");
  if (!teachers.length) {
    throw new Error("No teachers found. Run npm run seed:teachers first.");
  }

  const now = moment();
  const months = [
    { year: now.year(), month: now.month() + 1 },
    { year: now.clone().subtract(1, "month").year(), month: now.clone().subtract(1, "month").month() + 1 },
  ];

  const teacherIds = teachers.map((item) => item._id);
  const rangeStart = moment({ year: months[1].year, month: months[1].month - 1, day: 1 }).startOf("month").toDate();
  const rangeEnd = moment({ year: months[0].year, month: months[0].month - 1, day: 1 }).endOf("month").toDate();

  await TeacherAttendance.deleteMany({
    teacher: { $in: teacherIds },
    checkIn: { $gte: rangeStart, $lte: rangeEnd },
  });

  let total = 0;
  for (const item of months) {
    total += await seedMonth(teachers, item.year, item.month);
    console.log(`Seeded ${item.month}/${item.year}`);
  }

  console.log(`Seeded ${total} attendance records for ${teachers.length} teachers.`);
}

module.exports = { seedTeacherAttendance };

if (require.main === module) {
  const { runStandalone } = require("../Helpers/seedConnection");
  runStandalone(seedTeacherAttendance)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
