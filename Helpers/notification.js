const Notification = require("../Models/Notification");
const {
  emitAdminNotification,
  emitUserNotification,
  emitAdminNotificationRead,
  emitUserNotificationRead,
  emitUserNotificationDeleted,
} = require("./socketEmitter");
const {
  SEND_TO,
  normalizeSendTo,
  normalizeIdList,
  countRecipients,
  queueBroadcast,
} = require("./notificationBroadcast");

exports.sendNotificationToUser = async (
  userId,
  title,
  content,
  type = "NOTIFICATION",
  extras = {}
) => {
  try {
    const notification = await Notification.create({
      title,
      content,
      assignee: userId,
      type,
      isRead: false,
      sendTo: extras.sendTo || SEND_TO.PARENTS,
      broadcastId: extras.broadcastId,
      recipientRole: extras.recipientRole || "",
      isAdmin: false,
    });
    emitUserNotification(String(userId), notification);
    return notification;
  } catch (error) {
    console.error("Error saving notification:", error);
    return null;
  }
};

function systemInboxMatch() {
  return {
    isAdmin: true,
    $or: [
      { source: "SYSTEM" },
      {
        source: { $exists: false },
        type: "NOTIFICATION",
        $and: [
          { $or: [{ sendTo: "ADMIN" }, { sendTo: { $exists: false } }] },
          { $or: [{ deliveryStatus: "" }, { deliveryStatus: { $exists: false } }] },
        ],
      },
    ],
  };
}

function noticeMatch() {
  return {
    isAdmin: true,
    $or: [
      { source: "NOTICE" },
      {
        source: { $exists: false },
        $or: [
          {
            type: {
              $in: [
                "GENERAL",
                "ALERT",
                "ANNOUNCEMENT",
                "EVENT",
                "HOLIDAY",
                "REMINDER",
                "POLICY",
              ],
            },
          },
          { sendTo: { $in: ["TEACHERS", "PARENTS", "ALL", "CUSTOM", "CLASSROOM"] } },
          { deliveryStatus: { $in: ["QUEUED", "PROCESSING", "COMPLETED", "FAILED"] } },
        ],
      },
    ],
  };
}

function isSystemInboxNotification(notification) {
  if (!notification || notification.isAdmin === false) return false;
  if (notification.source === "NOTICE") return false;
  if (notification.source === "SYSTEM") return true;
  const sendTo = notification.sendTo || "ADMIN";
  const delivery = notification.deliveryStatus || "";
  return notification.type === "NOTIFICATION" && sendTo === "ADMIN" && !delivery;
}

exports.systemInboxMatch = systemInboxMatch;
exports.noticeMatch = noticeMatch;
exports.isSystemInboxNotification = isSystemInboxNotification;

exports.sendNotificationToAdmin = async (title, content, type = "NOTIFICATION") => {
  try {
    const notification = await Notification.create({
      title,
      content,
      isAdmin: true,
      source: "SYSTEM",
      type,
      isRead: false,
      sendTo: SEND_TO.ADMIN,
    });
    emitAdminNotification(notification);
    return notification;
  } catch (error) {
    console.error("Error saving notification:", error);
    return null;
  }
};

exports.createAdminNotification = async ({
  title,
  content,
  type = "GENERAL",
  sendTo = SEND_TO.ALL,
  targetTeachers = [],
  targetParents = [],
  targetClassroom = null,
}) => {
  const audience = normalizeSendTo(sendTo);
  if (audience === SEND_TO.ADMIN) {
    throw new Error("Notices must be sent to teachers and/or parents");
  }

  const recipientTotal = await countRecipients({
    sendTo: audience,
    targetTeachers,
    targetParents,
    targetClassroom,
  });

  const notification = await Notification.create({
    title,
    content,
    type,
    isAdmin: true,
    source: "NOTICE",
    isRead: false,
    sendTo: audience,
    targetTeachers: normalizeIdList(targetTeachers),
    targetParents: normalizeIdList(targetParents),
    targetClassroom:
      targetClassroom && require("mongoose").Types.ObjectId.isValid(String(targetClassroom))
        ? targetClassroom
        : undefined,
    deliveryStatus: "QUEUED",
    deliveryStats: { total: recipientTotal, sent: 0, failed: 0 },
  });

  if (recipientTotal > 0) {
    queueBroadcast(notification._id);
  } else {
    await Notification.findByIdAndUpdate(notification._id, {
      deliveryStatus: "COMPLETED",
      deliveryStats: { total: 0, sent: 0, failed: 0 },
    });
  }

  // Keep other admin clients in sync when a notice/alert is created.
  emitAdminNotification(notification);

  return notification;
};

exports.markAdminNotificationRead = async (notificationId) => {
  emitAdminNotificationRead({ id: notificationId, isRead: true });
};

exports.markAdminNotificationUnread = async (notificationId) => {
  emitAdminNotificationRead({ id: notificationId, isRead: false });
};

exports.markAllAdminNotificationsRead = async () => {
  emitAdminNotificationRead({ all: true, isRead: true });
};

exports.markUserNotificationRead = async (userId, notificationId, isRead = true) => {
  emitUserNotificationRead(userId, { id: notificationId, isRead });
};

/**
 * Recall an admin notice: delete the admin record and every recipient copy,
 * then notify each assignee over the socket so apps drop it instantly.
 */
exports.recallAdminNotice = async (adminNotice) => {
  if (!adminNotice?._id) {
    return { deletedRecipients: 0 };
  }

  const broadcastId = adminNotice._id;
  const recipients = await Notification.find({
    broadcastId,
    isAdmin: false,
  })
    .select("_id assignee")
    .lean();

  await Notification.deleteMany({
    $or: [{ _id: broadcastId }, { broadcastId }],
  });

  recipients.forEach((recipient) => {
    if (!recipient?.assignee) return;
    emitUserNotificationDeleted(String(recipient.assignee), {
      id: String(recipient._id),
      broadcastId: String(broadcastId),
    });
  });

  return { deletedRecipients: recipients.length };
};
