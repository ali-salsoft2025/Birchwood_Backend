const Notification = require("../Models/Notification");
const { emitUserNotificationDeleted } = require("./socketEmitter");

const DEFAULT_RETENTION_DAYS = 60;
const BATCH_SIZE = 500;

function retentionDaysFromEnv(override) {
  const raw =
    override !== undefined && override !== null
      ? override
      : process.env.NOTIFICATION_RETENTION_DAYS;
  const days = Number(raw);
  if (!Number.isFinite(days) || days < 1) {
    return DEFAULT_RETENTION_DAYS;
  }
  return Math.floor(days);
}

/**
 * Delete notices + notifications older than the retention window.
 * Runs in batches so large collections do not lock the DB for long.
 * Emits notification:deleted so connected apps drop stale rows.
 */
async function purgeOldNotifications(options = {}) {
  const days = retentionDaysFromEnv(options.days);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  let deleted = 0;

  for (;;) {
    const stale = await Notification.find({ createdAt: { $lt: cutoff } })
      .select("_id assignee isAdmin broadcastId")
      .limit(BATCH_SIZE)
      .lean();

    if (!stale.length) {
      break;
    }

    const result = await Notification.deleteMany({
      _id: { $in: stale.map((row) => row._id) },
    });
    deleted += result.deletedCount || 0;

    stale.forEach((row) => {
      if (row.isAdmin || !row.assignee) return;
      emitUserNotificationDeleted(String(row.assignee), {
        id: String(row._id),
        broadcastId: row.broadcastId ? String(row.broadcastId) : undefined,
      });
    });

    if (stale.length < BATCH_SIZE) {
      break;
    }
  }

  return { days, cutoff, deleted };
}

module.exports = {
  DEFAULT_RETENTION_DAYS,
  retentionDaysFromEnv,
  purgeOldNotifications,
};
