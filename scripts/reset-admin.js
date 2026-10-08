/**
 * Replace every admin login with one new account.
 *
 *   npm run reset:admin           local (.env.development)
 *   npm run reset:admin:live      live (.env.live)
 *
 * Live never reuses the old default password. Set ADMIN_SEED_PASSWORD in the
 * shell to choose one, otherwise a new password is printed once at the end.
 */
const crypto = require("crypto");
const { envFile } = require("../config/loadEnv");
const Admin = require("../Models/Admin");
const Parent = require("../Models/Parent");
const { runStandalone } = require("../Helpers/seedConnection");

const LIVE = process.argv.includes("--live");
const YES = process.argv.includes("--yes");
const OLD_PASSWORD = "Admin@Birchwood1";
const ADMIN_EMAIL = (process.env.ADMIN_SEED_EMAIL || "admin@thebirchwoodacademy.com")
  .trim()
  .toLowerCase();

function describeDb(uri) {
  const match = String(uri || "").match(/@([^/?]+)\/([^?]+)/);
  if (match) return `${match[1]}/${match[2]}`;
  return "(not set)";
}

function nextPassword() {
  const supplied = process.env.ADMIN_SEED_PASSWORD;
  if (!LIVE) return supplied || OLD_PASSWORD;
  if (supplied && supplied !== OLD_PASSWORD) return supplied;
  return `Birchwood-${crypto.randomBytes(9).toString("base64url")}`;
}

async function resetAdmin() {
  if (!process.env.DB) {
    throw new Error("DB is not set in .env");
  }
  if (LIVE && !YES) {
    throw new Error("Refusing to replace live admin credentials without --yes. Use: npm run reset:admin:live");
  }

  const password = nextPassword();
  console.log(`Replacing admin credentials using ${envFile}`);
  console.log(`Database: ${describeDb(process.env.DB)}`);

  const existing = await Admin.find({}).select("email").lean();
  const parentAdmins = await Parent.find({ isAdmin: true }).select("email").lean();
  if (existing.length) {
    console.log(`Removing admin logins: ${existing.map((row) => row.email).join(", ")}`);
  } else {
    console.log("No admin logins to remove");
  }
  if (parentAdmins.length) {
    console.log(`Removing parent-table admin logins: ${parentAdmins.map((row) => row.email).join(", ")}`);
  }

  const [adminResult, parentAdminResult] = await Promise.all([
    Admin.deleteMany({}),
    Parent.deleteMany({ isAdmin: true }),
  ]);

  const admin = new Admin({
    firstName: "Birchwood",
    lastName: "Admin",
    email: ADMIN_EMAIL,
    password,
    isAdmin: true,
    status: "ACTIVE",
  });
  await admin.save();

  console.log(`Deleted ${adminResult.deletedCount} admin account(s)`);
  if (parentAdminResult.deletedCount) {
    console.log(`Deleted ${parentAdminResult.deletedCount} parent-table admin account(s)`);
  }
  console.log("Created admin");
  console.log(`Email: ${ADMIN_EMAIL}`);
  console.log(`Password: ${password}`);
}

if (require.main === module) {
  runStandalone(resetAdmin)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Failed to reset admin:", err.message);
      process.exit(1);
    });
}
