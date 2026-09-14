/**
 * Auth-only seed — updates admin + teacher passwords.
 * Does NOT delete data, re-download photos, or change classrooms.
 *
 *   npm run seed:auth
 *   npm run seed:auth:live
 */
const { envFile } = require("../config/loadEnv");
const Admin = require("../Models/Admin");
const Teacher = require("../Models/Teacher");
const { TEACHERS } = require("./seed-teachers");

const ADMIN_EMAIL = (process.env.ADMIN_SEED_EMAIL || "admin@thebirchwoodacademy.com")
  .trim()
  .toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD || "Admin@Birchwood1";
const TEACHER_PASSWORD = process.env.TEACHER_SEED_PASSWORD || "Teacher@12345";

async function seedAuth() {
  if (!process.env.DB) {
    throw new Error("DB is not set in .env");
  }

  console.log(`Auth seed using ${envFile}`);
  console.log("Mode: password update only (no deletes)\n");

  let admin = await Admin.findOne({ email: ADMIN_EMAIL });
  if (admin) {
    admin.password = ADMIN_PASSWORD;
    admin.status = "ACTIVE";
    admin.isAdmin = true;
    await admin.save();
    console.log(`Admin password updated: ${ADMIN_EMAIL}`);
  } else {
    admin = new Admin({
      firstName: "Birchwood",
      lastName: "Admin",
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      isAdmin: true,
      status: "ACTIVE",
    });
    await admin.save();
    console.log(`Admin created: ${ADMIN_EMAIL}`);
  }

  const seedEmails = TEACHERS.map((t) => t.email.toLowerCase());
  const teachers = await Teacher.find({ email: { $in: seedEmails } });
  const found = new Set(teachers.map((t) => t.email.toLowerCase()));

  for (const teacher of teachers) {
    teacher.password = TEACHER_PASSWORD;
    await teacher.save();
    console.log(`Teacher password set: ${teacher.email}`);
  }

  const missing = seedEmails.filter((email) => !found.has(email));
  if (missing.length) {
    console.log("\nSeed teachers not found (skipped, nothing deleted):");
    missing.forEach((email) => console.log(`  - ${email}`));
  }

  console.log("\n======== Credentials ========");
  console.log(`Admin:    ${ADMIN_EMAIL}  /  ${ADMIN_PASSWORD}`);
  console.log(`Teachers: ${TEACHER_PASSWORD}  (all seeded teacher emails above)`);
}

module.exports = { seedAuth };

if (require.main === module) {
  const { runStandalone } = require("../Helpers/seedConnection");
  runStandalone(seedAuth)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Failed to seed auth:", err.message);
      process.exit(1);
    });
}
