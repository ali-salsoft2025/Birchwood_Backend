/**
 * Seed a few NOTICE homework items for parent Notices screen.
 *
 *   node scripts/seed-notices.js
 */
require("../config/loadEnv");
const Homework = require("../Models/Homework");
const Teacher = require("../Models/Teacher");
const Classroom = require("../Models/Classroom");
const Children = require("../Models/Children");
const { runStandalone } = require("../Helpers/seedConnection");

const NOTICE_TITLES = [
  "Parent–teacher meeting next week",
  "Uniform check reminder",
  "Early dismissal on Friday",
  "Library book return",
  "Healthy snack day",
];

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

async function seedNotices() {
  const [teachers, classrooms, children] = await Promise.all([
    Teacher.find({ status: "ACTIVE" }).sort({ createdAt: 1 }).limit(10),
    Classroom.find().sort({ createdAt: 1 }).limit(10),
    Children.find().sort({ createdAt: 1 }).limit(20),
  ]);

  if (!teachers.length || !classrooms.length) {
    throw new Error("Need teachers and classrooms in the database first.");
  }

  const removed = await Homework.deleteMany({
    type: "NOTICE",
    title: { $in: NOTICE_TITLES },
  });
  if (removed.deletedCount) {
    console.log(`Removed ${removed.deletedCount} previously seeded notices.`);
  }

  const teacher = teachers[0];
  const teacher2 = teachers[1] || teachers[0];
  const classroom = classrooms[0];
  const classroom2 = classrooms[1] || classrooms[0];
  const child = children[0];
  const now = new Date();

  const items = [
    {
      title: NOTICE_TITLES[0],
      description:
        "Meetings run Monday–Wednesday after school. Please book a 15-minute slot at the office or via the app.",
      teacher: teacher._id,
      classroom: classroom._id,
      assignee: "CLASS",
      dueDate: addDays(now, 7),
    },
    {
      title: NOTICE_TITLES[1],
      description:
        "Please ensure your child wears the full school uniform, including name-labelled jumpers and shoes.",
      teacher: teacher2._id,
      classroom: classroom2._id,
      assignee: "CLASS",
      dueDate: addDays(now, 3),
    },
    {
      title: NOTICE_TITLES[2],
      description:
        "School finishes at 12:30 this Friday for staff training. Arrange pickup or after-school care accordingly.",
      teacher: teacher._id,
      classroom: classroom._id,
      assignee: "CLASS",
      dueDate: addDays(now, 4),
    },
    {
      title: NOTICE_TITLES[3],
      description:
        "Borrowed library books are due back by next Wednesday so the next class can use them.",
      teacher: teacher2._id,
      classroom: classroom2._id,
      assignee: "CLASS",
      dueDate: addDays(now, 5),
    },
    {
      title: NOTICE_TITLES[4],
      description:
        "Next Tuesday is Healthy Snack Day — please send fruit or vegetables only (no sweets or crisps).",
      teacher: teacher._id,
      ...(child
        ? { children: child._id, assignee: "CHILD" }
        : { classroom: classroom._id, assignee: "CLASS" }),
      dueDate: addDays(now, 6),
    },
  ];

  for (const item of items) {
    await Homework.create({
      ...item,
      type: "NOTICE",
      assignDate: addDays(now, -1),
      status: "ACTIVE",
    });
    console.log(`Created notice: ${item.title}`);
  }

  console.log(`Seeded ${items.length} notices.`);
}

module.exports = { seedNotices };

if (require.main === module) {
  runStandalone(seedNotices).catch((error) => {
    console.error("Failed to seed notices:", error.message);
    process.exit(1);
  });
}
