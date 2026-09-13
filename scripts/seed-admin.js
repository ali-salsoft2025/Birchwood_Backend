const { envFile } = require("../config/loadEnv");
const mongoose = require("mongoose");
const Admin = require("../Models/Admin");
const Parent = require("../Models/Parent");

const ADMIN_EMAIL = (process.env.ADMIN_SEED_EMAIL || "admin@thebirchwoodacademy.com")
  .trim()
  .toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD || "Bw#9kP2mQ7xR!vL4nT8w";

async function seedAdmin() {
  if (!process.env.DB) {
    throw new Error("DB is not set in .env");
  }

  const environment = process.env.NODE_ENV || "development";
  console.log(`Seeding admin using ${envFile} (${environment})`);

  const fakeParentAdmin = await Parent.findOne({ email: ADMIN_EMAIL, isAdmin: true });
  if (fakeParentAdmin) {
    await Parent.deleteOne({ _id: fakeParentAdmin._id });
    console.log(`Removed parent-table admin ${ADMIN_EMAIL}`);
  }

  let admin = await Admin.findOne({ email: ADMIN_EMAIL });
  if (admin) {
    admin.password = ADMIN_PASSWORD;
    admin.firstName = admin.firstName || "Birchwood";
    admin.lastName = admin.lastName || "Admin";
    admin.isAdmin = true;
    admin.status = "ACTIVE";
    await admin.save();
    console.log(`Updated existing admin: ${ADMIN_EMAIL}`);
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
    console.log(`Created admin: ${ADMIN_EMAIL}`);
  }

  console.log("Password:", ADMIN_PASSWORD);
}

module.exports = { seedAdmin };

if (require.main === module) {
  const { runStandalone } = require("../Helpers/seedConnection");
  runStandalone(seedAdmin)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Failed to seed admin:", err.message);
      process.exit(1);
    });
}
