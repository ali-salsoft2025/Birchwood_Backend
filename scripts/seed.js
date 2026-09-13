/**
 * Single Birchwood seed — classrooms, people, images, ads, timetable, attendance, fees.
 *
 *   npm run seed              local (.env.development)
 *   npm run seed:live         live (.env.live)
 */
const { envFile } = require("../config/loadEnv");
const { openDb, closeDb } = require("../Helpers/seedConnection");

const { seedAdmin } = require("./seed-admin");
const { seedClassrooms } = require("./seed-classrooms");
const { seedTeachers } = require("./seed-teachers");
const { seedParents } = require("./seed-parents");
const { seedChildren } = require("./seed-children");
const { assignStudents } = require("./assign-students");
const { seedInventory } = require("./seed-inventory");
const { seedHolidays } = require("./seed-holidays");
const { seedActivities } = require("./seed-activities");
const { seedAdvertisements } = require("./seed-advertisements");
const { seedTimetable } = require("./seed-timetable");
const { seedStudentAttendance } = require("./seed-student-attendance");
const { seedTeacherAttendance } = require("./seed-teacher-attendance");
const { seedFeesHomeworkPostsNotifications } = require("./seed-fees-homework-posts-notifications");

const LIVE = process.argv.includes("--live");
const YES = process.argv.includes("--yes");

function describeDb(uri) {
  const value = String(uri || "");
  const match = value.match(/@([^/?]+)\/([^?]+)/);
  if (match) {
    return `${match[1]}/${match[2]}`;
  }
  return value.replace(/\/\/([^@]+)@/, "//***@") || "(not set)";
}

async function step(label, fn) {
  console.log(`\n======== ${label} ========`);
  await fn();
}

async function seed() {
  if (!process.env.DB) {
    throw new Error("DB is not set in .env");
  }

  console.log(`Seed using ${envFile}`);
  console.log(`Database: ${describeDb(process.env.DB)}`);

  if (LIVE && !YES) {
    throw new Error("Refusing to seed live without --yes. Use: npm run seed:live");
  }

  const started = Date.now();
  await openDb();

  try {
    await step("Admin", seedAdmin);
    await step("Classrooms", seedClassrooms);
    await step("Teachers + photos", seedTeachers);
    await step("Parents + photos", seedParents);
    await step("Students + photos", seedChildren);
    await step("Student parent/class links", assignStudents);
    await step("Inventory + photos", seedInventory);
    await step("Holidays", seedHolidays);
    await step("Activities + images", seedActivities);
    await step("Advertisements + banners", seedAdvertisements);
    await step("Timetable", seedTimetable);
    await step("Student attendance", seedStudentAttendance);
    await step("Teacher attendance", seedTeacherAttendance);
    await step("Fees, homework, posts, notifications", seedFeesHomeworkPostsNotifications);
  } finally {
    await closeDb();
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n======== Seed complete (${seconds}s) ========`);
  console.log(`Admin: ${process.env.ADMIN_SEED_EMAIL || "admin@thebirchwoodacademy.com"}`);
  console.log("Teachers: Teacher@12345  |  Parents: Parent@12345  (@birchwood.local)");
  console.log("Images saved under Uploads/");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err.message);
    process.exit(1);
  });
