/**
 * Homework create, list, child list, update, and delete.
 * Run: node scripts/test-homework.js
 */
require("../config/loadEnv");
const mongoose = require("mongoose");
const Children = require("../Models/Children");
const Teacher = require("../Models/Teacher");
const Parent = require("../Models/Parent");
const Homework = require("../Models/Homework");
const { generateToken } = require("../Helpers");
const { connectDB } = require("../config/db");

const BASE = process.env.API_BASE || "http://127.0.0.1:3031/api";
const created = [];

function fail(message) {
  console.error("FAIL", message);
  process.exitCode = 1;
}

function pass(message) {
  console.log("PASS", message);
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

function due(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
}

async function main() {
  await connectDB();
  const child = await Children.findOne({ parent: { $ne: null }, classroom: { $ne: null } }).lean();
  if (!child) {
    fail("No child with a parent and class");
    return;
  }
  const teacher = await Teacher.findById(child.classroom).catch(() => null);
  const classroomTeacher = await Teacher.findOne({ classroom: child.classroom, status: "ACTIVE" }).lean();
  const owner = classroomTeacher || teacher;
  if (!owner?._id) {
    fail("No teacher for that class");
    return;
  }
  const parent = await Parent.findById(child.parent).lean();
  const classmates = await Children.find({ classroom: child.classroom }).select("_id").limit(2).lean();
  const teacherToken = generateToken(owner);
  const parentToken = parent ? generateToken(parent) : "";
  const title = `HW test ${Date.now()}`;

  const blocked = await req("POST", "/homework/addHomework", {
    title,
    description: "Should fail",
    assignee: "CLASS",
    classroom: String(child.classroom),
    type: "HOMEWORK",
    dueDate: due(0),
  }, teacherToken);
  if (blocked.json?.status) fail("Today's due date was accepted");
  else pass("Due date must be after today");

  const denied = parentToken
    ? await req("POST", "/homework/addHomework", {
        title,
        description: "Parent should not assign",
        assignee: "CLASS",
        classroom: String(child.classroom),
        type: "HOMEWORK",
        dueDate: due(2),
      }, parentToken)
    : { json: { status: false } };
  if (denied.json?.status) fail("Parent was allowed to create homework");
  else pass("Parent cannot create homework");

  const classRes = await req("POST", "/homework/addHomework", {
    title: `${title} class`,
    description: "Class assignment",
    assignee: "CLASS",
    classroom: String(child.classroom),
    type: "HOMEWORK",
    dueDate: due(2),
  }, teacherToken);
  const classId = classRes.json?.data?.homework?._id;
  if (!classRes.json?.status || !classId) fail(`Class create failed: ${classRes.json?.message || classRes.status}`);
  else {
    created.push(classId);
    pass("Class homework created");
  }

  const childRes = await req("POST", "/homework/addHomework", {
    title: `${title} student`,
    description: "One student",
    assignee: "CHILD",
    children: String(child._id),
    type: "WARNING",
    dueDate: due(3),
  }, teacherToken);
  const childHw = childRes.json?.data?.homework?._id;
  if (!childRes.json?.status || !childHw) fail(`Student create failed: ${childRes.json?.message || childRes.status}`);
  else {
    created.push(childHw);
    pass("Student homework created");
  }

  if (classmates.length > 1) {
    const many = await req("POST", "/homework/addHomework", {
      title: `${title} many`,
      description: "Several students",
      assignee: "CHILD",
      children: classmates.map(item => String(item._id)),
      type: "NOTICE",
      dueDate: due(4),
    }, teacherToken);
    const list = many.json?.data?.homeworks || [];
    if (!many.json?.status || list.length !== classmates.length) {
      fail(`Multi-student create returned ${list.length}, expected ${classmates.length}: ${many.json?.message || ""}`);
    } else {
      list.forEach(item => created.push(item._id));
      pass("One homework record per selected student");
    }
  }

  const listRes = await req("GET", "/homework/getAllHomework?limit=100&page=1", null, teacherToken);
  const docs = listRes.json?.data?.docs || [];
  if (!docs.some(item => String(item._id) === String(classId))) fail("Class homework missing from teacher list");
  else pass("Teacher list includes the new homework");

  const childList = await req("GET", `/homework/getAllChildHomework/${child._id}?limit=100&page=1`, null, teacherToken);
  const childDocs = childList.json?.data?.docs || [];
  const seesClass = childDocs.some(item => String(item._id) === String(classId));
  const seesOwn = childDocs.some(item => String(item._id) === String(childHw));
  if (!seesClass || !seesOwn) fail("Child list did not include class and student homework");
  else pass("Child list includes class and student homework");

  const one = await req("GET", `/homework/getHomeworkById/${classId}`, null, teacherToken);
  if (!one.json?.status || one.json?.data?.homework?.title !== `${title} class`) fail("Get by id failed");
  else pass("Get homework by id");

  const updated = await req("POST", `/homework/updateHomework/${classId}`, {
    title: `${title} class updated`,
    description: "Class assignment",
    assignee: "CLASS",
    classroom: String(child.classroom),
    type: "HOMEWORK",
    dueDate: due(5),
  }, teacherToken);
  if (!updated.json?.status || updated.json?.data?.homework?.title !== `${title} class updated`) {
    fail(`Update failed: ${updated.json?.message || ""}`);
  } else pass("Homework updated");

  const removed = await req("GET", `/homework/deleteHomework/${childHw}`, null, teacherToken);
  if (!removed.json?.status) fail(`Delete failed: ${removed.json?.message || ""}`);
  else {
    created.splice(created.indexOf(childHw), 1);
    pass("Homework deleted");
  }
}

main()
  .catch(error => fail(error.message))
  .finally(async () => {
    if (created.length) {
      await Homework.deleteMany({ _id: { $in: created } });
    }
    await mongoose.disconnect();
  });
