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
  systemInboxMatch,
  noticeMatch,
  isSystemInboxNotification,
} = require("../../Helpers/notification");
const {
  SEND_TO,
  normalizeSendTo,
  normalizeIdList,
  countRecipients,
  queueBroadcast,
} = require("../../Helpers/notificationBroadcast");
const { parseQueryList } = require("../../Helpers/queryList");

const TYPES = ["ALERT", "ANNOUNCEMENT", "NOTIFICATION"];

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
    const type = TYPES.includes(req.body.type) ? req.body.type : "ANNOUNCEMENT";
    const sendTo = normalizeSendTo(req.body.sendTo);
    const targetTeachers = normalizeIdList(req.body.teachers);
    const targetParents = normalizeIdList(req.body.parents);
    const targetClassroom = req.body.classroom || null;

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

    const message =
      sendTo === SEND_TO.ADMIN
        ? "Notification created successfully"
        : "Notification queued for delivery";

    return res.status(201).json(ApiResponse({ notification }, message, true));
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

    if (req.body.title !== undefined) notification.title = String(req.body.title || "").trim();
    if (req.body.content !== undefined) notification.content = String(req.body.content || "").trim();
    if (req.body.type !== undefined && TYPES.includes(req.body.type)) {
      notification.type = req.body.type;
    }
    if (req.body.isRead !== undefined) notification.isRead = Boolean(req.body.isRead);

    await notification.save();
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
    const notification = await Notification.findByIdAndRemove(req.params.id);
    if (!notification) {
      return res.json(ApiResponse({}, "Notification not found", false));
    }
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

    const aggregate = [
      {
        $match: {
          assignee: new mongoose.Types.ObjectId(userId),
          isAdmin: false,
        },
      },
      { $sort: { createdAt: -1 } },
    ];

    if (req.query.isRead === "true") {
      aggregate.push({ $match: { isRead: true } });
    }
    if (req.query.isRead === "false") {
      aggregate.push({ $match: { isRead: false } });
    }

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
    const [count, notifications] = await Promise.all([
      Notification.countDocuments({ assignee: userId, isAdmin: false, isRead: false }),
      Notification.find({ assignee: userId, isAdmin: false, isRead: false })
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
