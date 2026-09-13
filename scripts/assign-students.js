/**
 * Assign seeded students to parents (1–2 each) and classes (max 2 per class).
 * Uses Mongo directly so it works on live without the API running.
 */
require("../config/loadEnv");
const mongoose = require("mongoose");
const Children = require("../Models/Children");
const Parent = require("../Models/Parent");
const Classroom = require("../Models/Classroom");
const { syncChildParentAssignment } = require("../Helpers/childParentSync");

const MAX_CHILDREN_PER_PARENT = 2;
const MAX_STUDENTS_PER_CLASS = 2;

function parentSlots(parentCount, studentCount) {
  const slots = [];
  for (let i = 0; i < parentCount; i += 1) {
    slots.push(i < 8 ? MAX_CHILDREN_PER_PARENT : 1);
  }
  const total = slots.reduce((sum, n) => sum + n, 0);
  if (total < studentCount) {
    throw new Error(`Not enough parent capacity (${total}) for ${studentCount} students`);
  }
  return slots;
}

function planParentIndices(parentCount, studentCount) {
  const slots = parentSlots(parentCount, studentCount);
  const plan = [];
  let parentIdx = 0;
  for (let s = 0; s < studentCount; s += 1) {
    while (parentIdx < parentCount && slots[parentIdx] === 0) parentIdx += 1;
    if (parentIdx >= parentCount) break;
    plan.push(parentIdx);
    slots[parentIdx] -= 1;
    if (slots[parentIdx] === 0) parentIdx += 1;
  }
  return plan;
}

function planClassIndices(classCount, studentCount, maxPerClass) {
  const loads = new Array(classCount).fill(0);
  const plan = [];
  let classIdx = 0;
  for (let s = 0; s < studentCount; s += 1) {
    while (loads[classIdx] >= maxPerClass) {
      classIdx = (classIdx + 1) % classCount;
    }
    plan.push(classIdx);
    loads[classIdx] += 1;
    classIdx = (classIdx + 1) % classCount;
  }
  return { plan, loads };
}

async function assignStudents() {
  if (!process.env.DB) {
    throw new Error("DB is not set in .env");
  }

  const students = await Children.find({ rollNumber: /^S\d{6}$/ }).sort({ rollNumber: 1 });
  const parents = await Parent.find({ parentId: /^P\d{6}$/ }).sort({ parentId: 1 });
  const classrooms = await Classroom.find({ status: "ACTIVE" }).sort({ classroomId: 1 });

  if (!students.length) {
    throw new Error("No seeded students (S000001…) found — run npm run seed:children first");
  }
  if (!parents.length) {
    throw new Error("No seeded parents (P000001…) found — run npm run seed:parents first");
  }
  if (!classrooms.length) {
    throw new Error("No classrooms found — run npm run seed:classrooms first");
  }

  const parentPlan = planParentIndices(parents.length, students.length);
  const { plan: classPlan, loads: classLoads } = planClassIndices(
    classrooms.length,
    students.length,
    MAX_STUDENTS_PER_CLASS
  );

  console.log(`Assigning ${students.length} students → ${parents.length} parents, ${classrooms.length} classes`);
  console.log(`Limits: max ${MAX_CHILDREN_PER_PARENT}/parent, max ${MAX_STUDENTS_PER_CLASS}/class`);

  for (let i = 0; i < students.length; i += 1) {
    const student = students[i];
    const parent = parents[parentPlan[i]];
    const classroom = classrooms[classPlan[i]];
    const previousParentId = student.parent;

    student.parent = parent._id;
    student.classroom = classroom._id;
    await student.save();
    await syncChildParentAssignment(student._id, parent._id, previousParentId);

    console.log(
      `${student.rollNumber} ${student.firstName} ${student.lastName} → parent ${parent.parentId} · class ${classroom.classroomId}`
    );
  }

  const parentCounts = {};
  parentPlan.forEach((idx) => {
    parentCounts[idx] = (parentCounts[idx] || 0) + 1;
  });
  const overloadedParents = Object.entries(parentCounts).filter(([, count]) => count > MAX_CHILDREN_PER_PARENT);
  const overloadedClasses = classLoads.filter((count) => count > MAX_STUDENTS_PER_CLASS);

  if (overloadedParents.length || overloadedClasses.length) {
    throw new Error("Assignment exceeded configured limits");
  }

  console.log("\nAssignment summary:");
  Object.entries(parentCounts).forEach(([idx, count]) => {
    const p = parents[Number(idx)];
    console.log(`  ${p.parentId} (${p.fatherFirstName} ${p.fatherLastName}): ${count} student(s)`);
  });
  classLoads.forEach((count, idx) => {
    if (count > 0) {
      console.log(`  ${classrooms[idx].classroomId}: ${count} student(s)`);
    }
  });
  console.log("\nDone.");
}

module.exports = { assignStudents };

if (require.main === module) {
  const { runStandalone } = require("../Helpers/seedConnection");
  runStandalone(assignStudents)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Failed to assign students:", err.message);
      process.exit(1);
    });
}
