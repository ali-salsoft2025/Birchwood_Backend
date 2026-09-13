const mongoose = require("mongoose");

async function openDb() {
  if (mongoose.connection.readyState === 1) {
    return;
  }
  if (!process.env.DB) {
    throw new Error("DB is not set in .env");
  }
  await mongoose.connect(process.env.DB);
}

async function closeDb() {
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }
}

async function runStandalone(fn) {
  await openDb();
  try {
    await fn();
  } finally {
    await closeDb();
  }
}

module.exports = { openDb, closeDb, runStandalone };
