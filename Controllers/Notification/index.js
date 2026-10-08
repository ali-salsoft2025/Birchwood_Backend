const Notification = require("../../Models/Notification");
const moment = require("moment");
const mongoose = require("mongoose");
const { ApiResponse } = require("../../Helpers/index");
const { errorHandler } = require("../../Helpers/errorHandler");
const {
  createAdminNotification,
  markAdminNotificationRead,
  markAdminNotificationUnread,
  markAllAdminNotificationsRead,
  markUserNotificationRead,
  sendNotificationToUser,
  systemInboxMatch,
  noticeMatch,
  isSystemInboxNotification,
  recallAdminNotice,
} = require("../../Helpers/notification");
const { emitUserNotificationDeleted } = require("../../Helpers/socketEmitter");
const {
  SEND_TO,
  normalizeSendTo,
  normalizeIdList,
  countRecipients,
  queueBroadcast,
} = require("../../Helpers/notificationBroadcast");
const { enqueueNotificationJob } = require("../../Helpers/notificationQueue");
const { parseQueryList } = require("../../Helpers/queryList");

const TYPES = [
  "GENERAL",
  "ALERT",
  "ANNOUNCEMENT",
  "EVENT",
  "HOLIDAY",
  "REMINDER",
  "POLICY",
  "NOTIFICATION",
];

function buildAdminMatch(query = {}) {
  const source = String(query.source || "NOTICE").toUpperCase();
  const match = source === "SYSTEM" ? systemInboxMatch() : noticeMatch();

  const reads = parseQueryList(query.isRead);
  if (reads.length === 1) match.isRead = reads[0] === "true";

  const types = parseQueryList(query.type).filter((type) => TYPES.includes(type));
  if (types.length === 1) match.type = types[0];
  else if (types.length > 1) match.type = { $in: types };

  if (query.sendTo && Object.values(SEND_TO).includes(query.sendTo)) {
    match.sendTo = query.sendTo;
  }

  return match;
}

function buildDateFilters(query = {}) {
  const filters = [];
  if (query.from) {
    filters.push({
      createdAt: { $gte: moment(query.from).startOf("day").toDate() },
    });
  }
  if (query.to) {
    filters.push({
      createdAt: { $lte: moment(query.to).endOf("day").toDate() },
    });
  }
  return filters;
}

exports.getAllAdminNotifications = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const { keyword } = req.query;

    const aggregate = [{ $match: buildAdminMatch(req.query) }, { $sort: { createdAt: -1 } }];

    if (keyword) {
      const regex = new RegExp(String(keyword).trim(), "i");
      aggregate.push({
        $match: {
          $or: [{ title: { $regex: regex } }, { content: { $regex: regex } }],
        },
      });
    }

    buildDateFilters(req.query).forEach((filter) => aggregate.push({ $match: filter }));

    const result = await Notification.aggregatePaginate(Notification.aggregate(aggregate), {
      page,
      limit,
    });

    return res.json(ApiResponse(result, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getUnreadAdminNotifications = async (req, res) => {
  try {
    const source = String(req.query.source || "SYSTEM").toUpperCase();
    const inboxMatch = {
      ...(source === "NOTICE" ? noticeMatch() : systemInboxMatch()),
      isRead: false,
    };
    const [count, notifications] = await Promise.all([
      Notification.countDocuments(inboxMatch),
      Notification.find(inboxMatch)
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    return res.json(
      ApiResponse(
        {
          count,
          totalUnreadCount: count,
          notifications,
        },
        "",
        true
      )
    );
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getNotificationDetail = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.json(ApiResponse({}, "Notification not found", false));
    }
    return res.json(ApiResponse({ notification }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.createAlertOrAnnoucement = async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    const content = String(req.body.content || "").trim();
    const type = TYPES.includes(req.body.type) ? req.body.type : "GENERAL";
    const sendTo = normalizeSendTo(req.body.sendTo);
    const targetTeachers = normalizeIdList(req.body.teachers);
    const targetParents = normalizeIdList(req.body.parents);
    const targetClassroom = req.body.classroom || null;

    if (sendTo === SEND_TO.ADMIN) {
      return res
        .status(400)
        .json(ApiResponse({}, "Notices must be sent to teachers and/or parents", false));
    }

    if (sendTo === SEND_TO.CUSTOM && !targetTeachers.length && !targetParents.length) {
      return res
        .status(400)
        .json(ApiResponse({}, "Select at least one teacher or parent", false));
    }

    if (sendTo === SEND_TO.CLASSROOM && !targetClassroom) {
      return res.status(400).json(ApiResponse({}, "Please select a class", false));
    }

    if (!title) {
      return res.status(400).json(ApiResponse({}, "Title is required", false));
    }

    const notification = await createAdminNotification({
      title,
      content,
      type,
      sendTo,
      targetTeachers,
      targetParents,
      targetClassroom,
    });

    return res
      .status(201)
      .json(ApiResponse({ notification }, "Notification queued for delivery", true));
  } catch (error) {
    return res.json(
      ApiResponse({}, errorHandler(error) ? errorHandler(error) : error.message, false)
    );
  }
};

exports.sendUserNotification = async (req, res) => {
  try {
    const userId = String(req.body.userId || "").trim();
    const title = String(req.body.title || "").trim();
    const content = String(req.body.content || "").trim();
    const type = TYPES.includes(req.body.type) ? req.body.type : "NOTIFICATION";

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json(ApiResponse({}, "Valid userId is required", false));
    }
    if (!title) {
      return res.status(400).json(ApiResponse({}, "Title is required", false));
    }

    enqueueNotificationJob(async () => {
      await sendNotificationToUser(userId, title, content, type);
    });

    return res
      .status(201)
      .json(ApiResponse({}, "Notification queued for delivery", true));
  } catch (error) {
    return res.json(
      ApiResponse({}, errorHandler(error) ? errorHandler(error) : error.message, false)
    );
  }
};

exports.updateNotification = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.json(ApiResponse({}, "Notification not found", false));
    }

    if (!notification.isAdmin) {
      return res
        .status(403)
        .json(ApiResponse({}, "Only admin notices can be edited here", false));
    }

    if (req.body.title !== undefined) notification.title = String(req.body.title || "").trim();
    if (req.body.content !== undefined) notification.content = String(req.body.content || "").trim();
    if (req.body.type !== undefined && TYPES.includes(req.body.type)) {
      notification.type = req.body.type;
    }
    if (req.body.isRead !== undefined) notification.isRead = Boolean(req.body.isRead);

    await notification.save();

    // Keep recipient copies in sync when editing a school notice.
    if (!isSystemInboxNotification(notification)) {
      const recipientPatch = {
        title: notification.title,
        content: notification.content,
        type: notification.type,
      };
      await Notification.updateMany(
        { broadcastId: notification._id, isAdmin: false },
        { $set: recipientPatch }
      );
    }

    return res.json(ApiResponse({ notification }, "Notification updated successfully", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const isRead = req.body.isRead !== undefined ? Boolean(req.body.isRead) : true;
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.json(ApiResponse({}, "Notification not found", false));
    }

    if (!notification.isAdmin) {
      const isOwner = String(notification.assignee) === String(req.user._id);
      if (!isOwner && !req.isAdmin) {
        return res.status(403).json(ApiResponse({}, "Not allowed to update this notification", false));
      }
    } else if (!req.isAdmin) {
      return res.status(403).json(ApiResponse({}, "Not allowed to update this notification", false));
    }

    notification.isRead = isRead;
    await notification.save();

    if (isSystemInboxNotification(notification)) {
      if (isRead) {
        markAdminNotificationRead(notification._id);
      } else {
        markAdminNotificationUnread(notification._id);
      }
    } else if (notification.assignee) {
      markUserNotificationRead(String(notification.assignee), notification._id, isRead);
    }

    return res.json(
      ApiResponse(
        { notification },
        isRead ? "Notification marked as read" : "Notification marked as unread",
        true
      )
    );
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    const source = String(req.body.source || "SYSTEM").toUpperCase();
    const match = {
      ...(source === "NOTICE" ? noticeMatch() : systemInboxMatch()),
      isRead: false,
    };
    const result = await Notification.updateMany(match, { isRead: true });

    if (source !== "NOTICE") {
      markAllAdminNotificationsRead();
    }

    return res.json(
      ApiResponse(
        { modifiedCount: result.modifiedCount || 0 },
        "All notifications marked as read",
        true
      )
    );
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.json(ApiResponse({}, "Notification not found", false));
    }

    // Admin notices: recall from every parent/teacher app copy as well.
    if (notification.isAdmin && !isSystemInboxNotification(notification)) {
      const { deletedRecipients } = await recallAdminNotice(notification);
      return res.json(
        ApiResponse(
          { deletedRecipients },
          "Notice recalled and removed from all users",
          true
        )
      );
    }

    await Notification.findByIdAndDelete(notification._id);
    return res.json(ApiResponse({}, "Notification deleted successfully", true));
  } catch (error) {
    return res.json(
      ApiResponse({}, errorHandler(error) ? errorHandler(error) : error.message, false)
    );
  }
};

exports.bulkUserNotifications = async (req, res) => {
  try {
    const action = String(req.body.action || "").toLowerCase();
    const ids = [
      ...new Set(
        (Array.isArray(req.body.ids) ? req.body.ids : [])
          .map((id) => String(id || "").trim())
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
      ),
    ];

    if (!["read", "unread", "delete"].includes(action)) {
      return res.json(ApiResponse({}, "Choose read, unread, or delete", false));
    }
    if (!ids.length) {
      return res.json(ApiResponse({}, "Select at least one notification", false));
    }

    const owned = await Notification.find({
      _id: { $in: ids },
      assignee: req.user._id,
      isAdmin: false,
    }).select("_id broadcastId");

    if (!owned.length) {
      return res.json(ApiResponse({}, "Those notifications are no longer available", false));
    }

    const ownedIds = owned.map((item) => item._id);
    const idStrings = ownedIds.map((id) => String(id));
    const userId = String(req.user._id);

    if (action === "delete") {
      await Notification.deleteMany({ _id: { $in: ownedIds } });
      owned.forEach((item) => {
        emitUserNotificationDeleted(userId, {
          id: String(item._id),
          broadcastId: item.broadcastId ? String(item.broadcastId) : undefined,
        });
      });
      return res.json(
        ApiResponse({ ids: idStrings, action }, "Notifications deleted", true)
      );
    }

    const isRead = action === "read";
    await Notification.updateMany({ _id: { $in: ownedIds } }, { $set: { isRead } });
    idStrings.forEach((id) => {
      markUserNotificationRead(userId, id, isRead);
    });
    return res.json(
      ApiResponse(
        { ids: idStrings, action, isRead },
        isRead ? "Marked as read" : "Marked as unread",
        true
      )
    );
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.deleteUserNotification = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.json(ApiResponse({}, "Notification not found", false));
    }

    const isOwner =
      !notification.isAdmin &&
      String(notification.assignee || "") === String(req.user._id);

    if (!isOwner) {
      return res
        .status(403)
        .json(ApiResponse({}, "Not allowed to delete this notification", false));
    }

    await Notification.findByIdAndDelete(notification._id);
    emitUserNotificationDeleted(String(notification.assignee), {
      id: String(notification._id),
      broadcastId: notification.broadcastId
        ? String(notification.broadcastId)
        : undefined,
    });
    return res.json(ApiResponse({}, "Notification deleted successfully", true));
  } catch (error) {
    return res.json(
      ApiResponse({}, errorHandler(error) ? errorHandler(error) : error.message, false)
    );
  }
};

exports.getUserNotifications = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const userId = req.user._id;
    const kind = String(req.query.kind || "").toLowerCase();

    const match = {
      assignee: new mongoose.Types.ObjectId(userId),
      isAdmin: false,
    };

    if (kind === "notice") {
      match.$or = [
        { source: "NOTICE" },
        { broadcastId: { $exists: true, $ne: null } },
      ];
    } else if (kind === "inbox") {
      match.$and = [
        {
          $or: [{ source: { $ne: "NOTICE" } }, { source: { $exists: false } }],
        },
        {
          $or: [{ broadcastId: null }, { broadcastId: { $exists: false } }],
        },
      ];
    }

    if (req.query.isRead === "true") {
      match.isRead = true;
    } else if (req.query.isRead === "false") {
      match.isRead = false;
    }

    const aggregate = [{ $match: match }, { $sort: { createdAt: -1 } }];

    const result = await Notification.aggregatePaginate(Notification.aggregate(aggregate), {
      page,
      limit,
    });

    return res.json(ApiResponse(result, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getUnreadUserNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const kind = String(req.query.kind || "").toLowerCase();
    const match = {
      assignee: userId,
      isAdmin: false,
      isRead: false,
    };

    if (kind === "notice") {
      match.$or = [
        { source: "NOTICE" },
        { broadcastId: { $exists: true, $ne: null } },
      ];
    } else if (kind === "inbox") {
      match.$and = [
        {
          $or: [{ source: { $ne: "NOTICE" } }, { source: { $exists: false } }],
        },
        {
          $or: [{ broadcastId: null }, { broadcastId: { $exists: false } }],
        },
      ];
    }

    const [count, notifications] = await Promise.all([
      Notification.countDocuments(match),
      Notification.find(match).sort({ createdAt: -1 }).limit(10).lean(),
    ]);

    return res.json(
      ApiResponse(
        {
          count,
          totalUnreadCount: count,
          notifications,
        },
        "",
        true
      )
    );
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};
