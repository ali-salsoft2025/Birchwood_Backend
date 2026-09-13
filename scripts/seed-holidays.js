require("../config/loadEnv");
const mongoose = require("mongoose");
const Holiday = require("../Models/Holiday");

const HOLIDAYS = [
  { name: "New Year's Day", date: "2026-01-01", audience: "BOTH" },
  { name: "Chinese New Year", date: "2026-02-17", audience: "BOTH" },
  { name: "Nyepi (Day of Silence)", date: "2026-03-19", audience: "BOTH" },
  { name: "Good Friday", date: "2026-04-03", audience: "BOTH" },
  { name: "Labour Day", date: "2026-05-01", audience: "BOTH" },
  { name: "Ascension Day", date: "2026-05-14", audience: "BOTH" },
  { name: "Pancasila Day", date: "2026-06-01", audience: "BOTH" },
  {
    name: "Summer Break",
    date: "2026-06-15",
    endDate: "2026-07-31",
    audience: "BOTH",
  },
  {
    name: "Summer Break",
    date: "2026-08-01",
    endDate: "2026-08-31",
    audience: "STUDENT",
  },
  { name: "Teacher Planning Day", date: "2026-07-24", audience: "TEACHER" },
  { name: "Independence Day", date: "2026-08-17", audience: "BOTH" },
  { name: "Mid-Term Break", date: "2026-10-12", endDate: "2026-10-16", audience: "BOTH" },
  { name: "End of Term", date: "2026-12-18", audience: "STUDENT" },
  { name: "Christmas Day", date: "2026-12-25", audience: "BOTH" },
];

async function seedHolidays() {
  if (!process.env.DB) {
    throw new Error("DB is not set in .env");
  }

  const names = [...new Set(HOLIDAYS.map((item) => item.name))];
  const removed = await Holiday.deleteMany({ name: { $in: names } });
  if (removed.deletedCount) {
    console.log(`Removed ${removed.deletedCount} previously seeded holidays.`);
  }

  for (const item of HOLIDAYS) {
    const payload = {
      name: item.name,
      date: new Date(item.date),
      audience: item.audience || "BOTH",
    };
    if (item.endDate) {
      payload.endDate = new Date(item.endDate);
    }
    await Holiday.create(payload);
    console.log(
      `Created ${item.name} [${item.audience}] (${item.date}${item.endDate ? ` – ${item.endDate}` : ""})`
    );
  }

  console.log(`Seeded ${HOLIDAYS.length} holidays for 2026.`);
}

module.exports = { seedHolidays };

if (require.main === module) {
  const { runStandalone } = require("../Helpers/seedConnection");
  runStandalone(seedHolidays).catch((error) => {
    console.error("Failed to seed holidays:", error.message);
    process.exit(1);
  });
}
