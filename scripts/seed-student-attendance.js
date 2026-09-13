require("../config/loadEnv");
const mongoose = require("mongoose");
const moment = require("moment");
const Children = require("../Models/Children");
const Attendance = require("../Models/Attendance");

const LEAVE_REASONS = [
  "Family appointment",
  "Not feeling well",
  "Travel",
  "Doctor visit",
];

function buildRecord(childId, classroomId, day, status, extra = {}) {
  const checkIn = day.clone().hour(8).minute(15 + (day.date() % 20)).second(0).toDate();
  return {
    children: childId,
    classroom: classroomId || undefined,
    markedBy: "ADMIN",
    status,
    checkIn,
    leaveReason: extra.leaveReason || "",
  };
}

function statusForDay(studentIndex, day) {
  const date = day.date();
  const dow = day.day();
  const mix = (studentIndex * 7 + date + dow * 2) % 16;

  if (mix === 0 || mix === 8) return { status: "ABSENT" };
  if (mix === 1) {
    return {
      status: "LEAVE",
      leaveReason: LEAVE_REASONS[(studentIndex + date) % LEAVE_REASONS.length],
    };
  }
  if (date === 1 && studentIndex % 4 === 0) {
    return { status: "HOLIDAY", leaveReason: "School holiday" };
  }
  return { status: "PRESENT" };
}

async function seedMonth(students, year, month) {
  const start = moment({ year, month: month - 1, day: 1 }).startOf("day");
  const end = start.clone().endOf("month");
  const today = moment().endOf("day");
  const records = [];

  for (let index = 0; index < students.length; index++) {
    const student = students[index];
    for (let day = start.clone(); day.isSameOrBefore(end); day.add(1, "day")) {
      if (day.day() === 0 || day.day() === 6) continue;
      if (day.isAfter(today)) continue;

      const pick = statusForDay(index, day);
      records.push(
        buildRecord(student._id, student.classroom, day, pick.status, pick)
      );
    }
  }

  if (!records.length) return 0;
  await Attendance.insertMany(records);
  return records.length;
}

async function seedStudentAttendance() {
  if (!process.env.DB) {
    throw new Error("DB is not set in .env");
  }

  const students = await Children.find({ status: { $ne: "INACTIVE" } }).select("_id firstName lastName classroom");
  if (!students.length) {
    throw new Error("No students found. Run npm run seed:children first.");
  }

  const now = moment();
  const months = [
    { year: now.year(), month: now.month() + 1 },
    { year: now.clone().subtract(1, "month").year(), month: now.clone().subtract(1, "month").month() + 1 },
  ];

  const studentIds = students.map((item) => item._id);
  const rangeStart = moment({ year: months[1].year, month: months[1].month - 1, day: 1 })
    .startOf("month")
    .toDate();
  const rangeEnd = moment({ year: months[0].year, month: months[0].month - 1, day: 1 })
    .endOf("month")
    .toDate();

  await Attendance.deleteMany({
    children: { $in: studentIds },
    checkIn: { $gte: rangeStart, $lte: rangeEnd },
  });

  let total = 0;
  for (const item of months) {
    total += await seedMonth(students, item.year, item.month);
    console.log(`Seeded student attendance for ${item.month}/${item.year}`);
  }

  console.log(`Seeded ${total} student attendance records for ${students.length} students.`);
}

module.exports = { seedStudentAttendance };

if (require.main === module) {
  const { runStandalone } = require("../Helpers/seedConnection");
  runStandalone(seedStudentAttendance)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
