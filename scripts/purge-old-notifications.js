/**
 * Manually purge old notices / notifications.
 *
 *   node scripts/purge-old-notifications.js
 *   node scripts/purge-old-notifications.js --days=30
 */
require("../config/loadEnv");
const { runStandalone } = require("../Helpers/seedConnection");
const { purgeOldNotifications } = require("../Helpers/notificationCleanup");

async function main() {
  const daysArg = process.argv.find((arg) => arg.startsWith("--days="));
  const days = daysArg ? Number(daysArg.split("=")[1]) : undefined;
  const result = await purgeOldNotifications({ days });
  console.log(
    `Purged ${result.deleted} notification(s) older than ${result.days} day(s) (before ${result.cutoff.toISOString()}).`,
  );
}

runStandalone(main).catch((error) => {
  console.error("Failed to purge notifications:", error.message);
  process.exit(1);
});
