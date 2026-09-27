/**
 * Smoke-test the teacher app APIs.
 * Run: node scripts/test-teacher-app.js
 */
require("../config/loadEnv");
const Classroom = require("../Models/Classroom");
const Children = require("../Models/Children");
const Teacher = require("../Models/Teacher");
const Timetable = require("../Models/TimeTable");
const { generateToken } = require("../Helpers");
const { connectDB } = require("../config/db");

const BASE = process.env.API_BASE || "http://127.0.0.1:3031/api";
const created = [];
let failed = 0;

function pass(message) {
  console.log("PASS", message);
}

function fail(message, extra) {
  failed += 1;
  console.error("FAIL", message, extra ? JSON.stringify(extra) : "");
}

async function req(method, urlPath, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function tomorrowKey() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekdayKey(date) {
  return ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][date.getDay()];
}

async function main() {
  await connectDB();
  const teacher = await Teacher.findOne({ status: "ACTIVE", classroom: { $ne: null } }).lean();
  if (!teacher) {
    fail("No active teacher with a class");
    return;
  }
  const classroomId = String(teacher.classroom._id || teacher.classroom);
  const room = await Classroom.findById(classroomId).select("teacher").lean();
  const owner = room?.teacher ? await Teacher.findById(room.teacher).lean() : teacher;
  const token = generateToken(owner || teacher);
  const child = await Children.findOne({ classroom: classroomId }).lean();

  const profile = await req("GET", "/teacher/profile/getProfile", null, token);
  if (profile.json?.status && profile.json?.data?._id) pass("Profile loads");
  else fail("Profile loads", profile.json);

  const kids = await req("GET", `/admin/children/getChildrenByClassroom/${classroomId}?limit=100`, null, token);
  if (kids.json?.status) pass("Class students load");
  else fail("Class students load", kids.json);

  const homework = await req("GET", "/homework/getAllHomework?limit=5", null, token);
  if (homework.json?.status) pass("Homework list loads");
  else fail("Homework list loads", homework.json);

  const timetable = await req("GET", `/timetable/getAllClassTimetables/${classroomId}`, null, token);
  if (timetable.json?.status && timetable.json?.data?.byDay) pass("Timetable loads");
  else fail("Timetable loads", timetable.json);

  const holidays = await req("GET", "/holiday/getAllHolidays", null, token);
  if (holidays.json?.status) pass("School calendar loads");
  else fail("School calendar loads", holidays.json);

  const notices = await req("GET", "/notification/getUserNotifications?page=1&limit=5", null, token);
  if (notices.status < 500) pass("Notices endpoint responds");
  else fail("Notices endpoint responds", notices.json);

  const day = weekdayKey(new Date());
  const schoolDay = ["MON", "TUE", "WED", "THU", "FRI"].includes(day) ? day : "MON";
  const slot = await req("POST", "/timetable/addTimetable", {
    classroom: classroomId,
    day: schoolDay,
    startTime: "06:00 AM",
    endTime: "06:20 AM",
    subject: `Smoke ${Date.now()}`,
    meta: "",
    description: "",
  }, token);
  if (slot.json?.status && slot.json?.data?.newTimetable?._id) {
    created.push(slot.json.data.newTimetable._id);
    pass("Teacher can add a timetable slot");
  } else fail("Teacher can add a timetable slot", slot.json);

  const overlap = await req("POST", "/timetable/addTimetable", {
    classroom: classroomId,
    day: schoolDay,
    startTime: "06:10 AM",
    endTime: "06:30 AM",
    subject: "Overlap",
    meta: "",
    description: "",
  }, token);
  if (!overlap.json?.status && /already runs/i.test(overlap.json?.message || "")) pass("Overlapping slot is rejected");
  else fail("Overlapping slot is rejected", overlap.json);

  const touch = await req("POST", "/timetable/addTimetable", {
    classroom: classroomId,
    day: schoolDay,
    startTime: "06:20 AM",
    endTime: "06:40 AM",
    subject: "Back to back",
    meta: "BREAK",
    description: "",
  }, token);
  if (touch.json?.status && touch.json?.data?.newTimetable?._id) {
    created.push(touch.json.data.newTimetable._id);
    pass("Back-to-back break is allowed");
  } else fail("Back-to-back break is allowed", touch.json);

  if (child?._id) {
    const checkIn = await req("POST", "/children/attendance/markCheckIn", {
      children: String(child._id),
      markedBy: "TEACHER",
      checkIn: new Date().toISOString(),
    }, token);
    if (checkIn.json?.status || /opens at|school days|already marked/i.test(checkIn.json?.message || "")) {
      pass("Student check-in is separate from the teacher");
    } else fail("Student check-in is separate from the teacher", checkIn.json);
  } else pass("No student in class to check in");

  const copy = await req("POST", "/timetable/copyTimetable", {
    classroom: classroomId,
    mode: "day",
    sourceDate: tomorrowKey(),
    targetDate: tomorrowKey(),
  }, token);
  if (!copy.json?.status) pass("Copy refuses the same date");
  else fail("Copy refuses the same date", copy.json);
}

main()
  .catch((error) => fail(error.message))
  .finally(async () => {
    if (created.length) {
      await Timetable.deleteMany({ _id: { $in: created } });
    }
    const mongoose = require("mongoose");
    await mongoose.connection.close();
    if (failed) process.exit(1);
  });
