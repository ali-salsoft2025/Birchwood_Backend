const { envFile } = require("../config/loadEnv");
const mongoose = require("mongoose");

const KEEP = new Set(["admin", "admins"]);

function assertLocalDb(uri) {
  const value = String(uri || "");
  if (!/localhost|127\.0\.0\.1/.test(value)) {
    throw new Error("Refusing to wipe: DB is not local (localhost / 127.0.0.1).");
  }
  if (process.argv.includes("--live")) {
    throw new Error("Refusing to wipe the live database.");
  }
}

async function wipeLocalExceptAdmin() {
  if (!process.env.DB) {
    throw new Error("DB is not set in .env");
  }

  assertLocalDb(process.env.DB);
  console.log(`Wiping local data using ${envFile}`);
  console.log("Keeping admin collection only");

  await mongoose.connect(process.env.DB);
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  const adminCount = await db.collection("admins").estimatedDocumentCount().catch(() => 0);

  console.log(`Admins before wipe: ${adminCount}`);

  for (const { name } of collections) {
    if (KEEP.has(name) || name.startsWith("system.")) {
      console.log(`Kept ${name}`);
      continue;
    }
    const result = await db.collection(name).deleteMany({});
    console.log(`Cleared ${name}: ${result.deletedCount} document(s)`);
  }

  const remaining = await db.collection("admins").estimatedDocumentCount().catch(() => 0);
  console.log(`Admins after wipe: ${remaining}`);

  await mongoose.disconnect();
}

wipeLocalExceptAdmin()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed to wipe local data:", err.message);
    process.exit(1);
  });
