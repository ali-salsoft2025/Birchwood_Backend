const { envFile } = require("../config/loadEnv");
const mongoose = require("mongoose");
const Admin = require("../Models/Admin");
const Parent = require("../Models/Parent");

const ADMIN_EMAIL = "admin@thebirchwoodacademy.com";
const ADMIN_PASSWORD = "Admin@123456";

async function resetAdmin() {
  if (!process.env.DB) {
    throw new Error("DB is not set in .env");
  }

  const environment = process.env.NODE_ENV || "development";
  console.log(`Resetting admins using ${envFile} (${environment})`);

  await mongoose.connect(process.env.DB);

  const [adminResult, parentAdminResult] = await Promise.all([
    Admin.deleteMany({}),
    Parent.deleteMany({ isAdmin: true }),
  ]);

  console.log(`Deleted ${adminResult.deletedCount} admin account(s)`);
  if (parentAdminResult.deletedCount) {
    console.log(`Deleted ${parentAdminResult.deletedCount} parent-table admin account(s)`);
  }

  const admin = new Admin({
    firstName: "Birchwood",
    lastName: "Admin",
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    isAdmin: true,
    status: "ACTIVE",
  });
  await admin.save();

  console.log("Created admin");
  console.log(`Email: ${ADMIN_EMAIL}`);
  console.log(`Password: ${ADMIN_PASSWORD}`);

  await mongoose.disconnect();
}

resetAdmin()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed to reset admin:", err.message);
    process.exit(1);
  });
