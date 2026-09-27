const mongoose = require("mongoose");
const Notification = require("../Models/Notification");
const Teacher = require("../Models/Teacher");
const Parent = require("../Models/Parent");
const Children = require("../Models/Children");
const Classroom = require("../Models/Classroom");
const { emitUserNotification, emitUserNotificationDeleted } = require("./socketEmitter");
const { enqueueNotificationJob } = require("./notificationQueue");

const SEND_TO = {
  ADMIN: "ADMIN",
  TEACHERS: "TEACHERS",
  PARENTS: "PARENTS",
  ALL: "ALL",
  CUSTOM: "CUSTOM",
  CLASSROOM: "CLASSROOM",
};

const BATCH_SIZE = 50;

function normalizeSendTo(value) {
  const normalized = String(value || SEND_TO.ADMIN).trim().toUpperCase();
  return Object.values(SEND_TO).includes(normalized) ? normalized : SEND_TO.ADMIN;
}

function normalizeIdList(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((item) => String(item || "").trim())
    .filter((item) => mongoose.Types.ObjectId.isValid(item));
}

function audiencesForSendTo(sendTo) {
  if (sendTo === SEND_TO.TEACHERS) return ["TEACHER"];
  if (sendTo === SEND_TO.PARENTS) return ["PARENT"];
  if (sendTo === SEND_TO.ALL) return ["TEACHER", "PARENT"];
  return [];
}

function modelForAudience(audience) {
  return audience === "TEACHER" ? Teacher : Parent;
}

async function resolveRecipientGroups(broadcast) {
  const sendTo = normalizeSendTo(broadcast.sendTo);

  if (sendTo === SEND_TO.CUSTOM) {
    const groups = [];
    const teacherIds = normalizeIdList(broadcast.targetTeachers);
    const parentIds = normalizeIdList(broadcast.targetParents);

    if (teacherIds.length) {
      groups.push({ role: "TEACHER", ids: teacherIds });
    }
    if (parentIds.length) {
      groups.push({ role: "PARENT", ids: parentIds });
    }
    return groups;
  }

  if (sendTo === SEND_TO.CLASSROOM) {
    const classroomId = broadcast.targetClassroom;
    if (!classroomId || !mongoose.Types.ObjectId.isValid(String(classroomId))) {
      return [];
    }

    const groups = [];
    const children = await Children.find({
      classroom: classroomId,
      status: "ACTIVE",
    })
      .select("parent")
      .lean();

    const parentIds = [
      ...new Set(
        children
          .map((child) => child.parent)
          .filter(Boolean)
          .map(String)
      ),
    ];

    if (parentIds.length) {
      groups.push({ role: "PARENT", ids: parentIds });
    }

    const classroom = await Classroom.findById(classroomId).select("teacher").lean();
    if (classroom?.teacher) {
      groups.push({ role: "TEACHER", ids: [String(classroom.teacher)] });
    }

    return groups;
  }

  return audiencesForSendTo(sendTo).map((role) => ({ role, ids: null }));
}

async function countRecipients(target = {}) {
  const sendTo = normalizeSendTo(typeof target === "string" ? target : target.sendTo);
  if (sendTo === SEND_TO.ADMIN) return 0;

  const groups = await resolveRecipientGroups(
    typeof target === "string"
      ? { sendTo: target }
      : {
          sendTo,
          targetTeachers: target.targetTeachers,
          targetParents: target.targetParents,
          targetClassroom: target.targetClassroom,
        }
  );

  let total = 0;
  for (const group of groups) {
    if (group.ids) {
      total += group.ids.length;
      continue;
    }

    const Model = modelForAudience(group.role);
    total += await Model.countDocuments({ status: "ACTIVE" });
  }

  return total;
}

async function deliverBatch({ broadcast, recipientIds, recipientRole }) {
  if (!recipientIds.length) {
    return { sent: 0, failed: 0 };
  }

  const stillAlive = async () =>
    Boolean(await Notification.exists({ _id: broadcast._id, isAdmin: true }));

  if (!(await stillAlive())) {
    return { sent: 0, failed: recipientIds.length };
  }

  const docs = recipientIds.map((assignee) => ({
    title: broadcast.title,
    content: broadcast.content,
    type: broadcast.type,
    assignee,
    isAdmin: false,
    isRead: false,
    source: "NOTICE",
    sendTo: broadcast.sendTo,
    broadcastId: broadcast._id,
    recipientRole,
  }));

  let inserted = [];

  try {
    inserted = await Notification.insertMany(docs, { ordered: false });
  } catch (error) {
    if (error?.insertedDocs?.length) {
      inserted = error.insertedDocs;
    } else {
      console.error("Notification batch insert failed:", error.message);
      return { sent: 0, failed: recipientIds.length };
    }
  }

  // Recall may have landed between stillAlive and insertMany — drop orphans.
  if (!(await stillAlive())) {
    const orphanIds = inserted.map((row) => row._id).filter(Boolean);
    if (orphanIds.length) {
      await Notification.deleteMany({ _id: { $in: orphanIds } });
    }
    await purgeBroadcastOrphans(broadcast._id);
    return { sent: 0, failed: recipientIds.length };
  }

  inserted.forEach((notification) => {
    emitUserNotification(String(notification.assignee), notification);
  });

  const sent = inserted.length;
  return {
    sent,
    failed: Math.max(0, recipientIds.length - sent),
  };
}

async function purgeBroadcastOrphans(broadcastId) {
  if (!broadcastId) return 0;
  const orphans = await Notification.find({
    broadcastId,
    isAdmin: false,
  })
    .select("_id assignee")
    .lean();

  if (!orphans.length) return 0;

  await Notification.deleteMany({
    _id: { $in: orphans.map((row) => row._id) },
  });

  orphans.forEach((row) => {
    if (!row.assignee) return;
    emitUserNotificationDeleted(String(row.assignee), {
      id: String(row._id),
      broadcastId: String(broadcastId),
    });
  });

  return orphans.length;
}

async function deliverGroupBatches(broadcast, group, onProgress) {
  let total = 0;
  let sent = 0;
  let failed = 0;
  const broadcastId = broadcast._id;

  const stillAlive = async () =>
    Boolean(await Notification.exists({ _id: broadcastId, isAdmin: true }));

  if (group.ids) {
    for (let index = 0; index < group.ids.length; index += BATCH_SIZE) {
      if (!(await stillAlive())) {
        return { total, sent, failed };
      }
      const batch = group.ids.slice(index, index + BATCH_SIZE);
      const result = await deliverBatch({
        broadcast,
        recipientIds: batch,
        recipientRole: group.role,
      });
      total += batch.length;
      sent += result.sent;
      failed += result.failed;
      await onProgress({ total, sent, failed });
    }
    return { total, sent, failed };
  }

  const Model = modelForAudience(group.role);
  const cursor = Model.find({ status: "ACTIVE" }).select("_id").lean().cursor();
  let batch = [];

  for await (const doc of cursor) {
    if (!(await stillAlive())) {
      return { total, sent, failed };
    }
    batch.push(doc._id);
    if (batch.length >= BATCH_SIZE) {
      const result = await deliverBatch({
        broadcast,
        recipientIds: batch,
        recipientRole: group.role,
      });
      total += batch.length;
      sent += result.sent;
      failed += result.failed;
      batch = [];
      await onProgress({ total, sent, failed });
    }
  }

  if (batch.length) {
    if (!(await stillAlive())) {
      return { total, sent, failed };
    }
    const result = await deliverBatch({
      broadcast,
      recipientIds: batch,
      recipientRole: group.role,
    });
    total += batch.length;
    sent += result.sent;
    failed += result.failed;
    await onProgress({ total, sent, failed });
  }

  return { total, sent, failed };
}

async function processBroadcast(broadcastId) {
  const broadcast = await Notification.findById(broadcastId);
  if (!broadcast || !broadcast.isAdmin) return;

  const groups = await resolveRecipientGroups(broadcast);
  if (!groups.length) {
    await Notification.findByIdAndUpdate(broadcastId, {
      deliveryStatus: "COMPLETED",
      deliveryStats: { total: 0, sent: 0, failed: 0 },
    });
    return;
  }

  await Notification.findByIdAndUpdate(broadcastId, {
    deliveryStatus: "PROCESSING",
  });

  let total = 0;
  let sent = 0;
  let failed = 0;

  try {
    for (const group of groups) {
      // Stop if admin recalled the notice mid-delivery.
      const stillExists = await Notification.exists({ _id: broadcastId, isAdmin: true });
      if (!stillExists) {
        await purgeBroadcastOrphans(broadcastId);
        return;
      }

      const result = await deliverGroupBatches(broadcast, group, async (stats) => {
        const alive = await Notification.exists({ _id: broadcastId, isAdmin: true });
        if (!alive) return;

        total = stats.total;
        sent = stats.sent;
        failed = stats.failed;
        await Notification.findByIdAndUpdate(broadcastId, {
          deliveryStats: { total, sent, failed },
        });
      });
      total = result.total;
      sent = result.sent;
      failed = result.failed;
    }

    const stillExists = await Notification.exists({ _id: broadcastId, isAdmin: true });
    if (!stillExists) {
      await purgeBroadcastOrphans(broadcastId);
      return;
    }

    await Notification.findByIdAndUpdate(broadcastId, {
      deliveryStatus: "COMPLETED",
      deliveryStats: { total, sent, failed },
    });
  } catch (error) {
    console.error("Broadcast delivery failed:", error.message);
    const stillExists = await Notification.exists({ _id: broadcastId, isAdmin: true });
    if (!stillExists) {
      await purgeBroadcastOrphans(broadcastId);
      return;
    }
    await Notification.findByIdAndUpdate(broadcastId, {
      deliveryStatus: "FAILED",
      deliveryStats: { total, sent, failed },
    });
  }
}

function queueBroadcast(broadcastId) {
  enqueueNotificationJob(() => processBroadcast(broadcastId));
}

module.exports = {
  SEND_TO,
  normalizeSendTo,
  normalizeIdList,
  audiencesForSendTo,
  resolveRecipientGroups,
  countRecipients,
  queueBroadcast,
  processBroadcast,
  purgeBroadcastOrphans,
};
