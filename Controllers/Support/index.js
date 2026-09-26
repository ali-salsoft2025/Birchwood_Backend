const mongoose = require("mongoose");
const SupportTicket = require("../../Models/SupportTicket");
const SupportMessage = require("../../Models/SupportMessage");
const Children = require("../../Models/Children");
const { ApiResponse } = require("../../Helpers/index");
const {
  buildTicketFilter,
  canAccessTicket,
  generateTicketNumber,
  getRequestRole,
  resolveParticipant,
  resolveSenderSnapshot,
} = require("../../Helpers/supportAccess");
const {
  emitSupportMessage,
  emitSupportTicketUpdated,
  emitSupportTicketNew,
} = require("../../Helpers/socketEmitter");

const STATUSES = ["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"];
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];
const CATEGORIES = ["GENERAL", "FEES", "HOMEWORK", "ATTENDANCE", "OTHER"];

const STATUS_LABELS = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  WAITING: "Waiting",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

const PRIORITY_LABELS = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

async function recordTicketEvent(ticket, req, { eventType, body, eventMeta = {} }) {
  const sender = await resolveSenderSnapshot(req);
  if (!sender) return null;

  const message = await SupportMessage.create({
    ticket: ticket._id,
    ...sender,
    body,
    isInternal: true,
    kind: "EVENT",
    eventType,
    eventMeta,
  });

  emitSupportMessage({
    ticketId: String(ticket._id),
    ticket: normalizeTicket(ticket.toObject(), req),
    message,
  });

  return message;
}

function normalizeTicket(ticket, req) {
  if (!ticket) return ticket;
  const role = getRequestRole(req);
  const doc = { ...ticket };
  if (role !== "ADMIN") {
    doc.adminUnreadCount = undefined;
  }
  return doc;
}

exports.createTicket = async (req, res) => {
  try {
    const role = getRequestRole(req);
    if (!role) {
      return res.status(403).json(ApiResponse({}, "Access forbidden", false));
    }

    const subject = String(req.body.subject || "").trim();
    const initialMessage = String(req.body.message || req.body.body || "").trim();
    if (!subject) {
      return res.json(ApiResponse({}, "Subject is required", false));
    }
    if (!initialMessage) {
      return res.json(ApiResponse({}, "Message is required", false));
    }

    let participantRole = String(req.body.participantRole || "").toUpperCase();
    let participantId = req.body.participant || req.body.participantId;

    if (role === "TEACHER") {
      participantRole = "TEACHER";
      participantId = req.user._id;
    } else if (role === "PARENT") {
      participantRole = "PARENT";
      participantId = req.user._id;
    } else if (role === "ADMIN") {
      if (!["TEACHER", "PARENT"].includes(participantRole) || !participantId) {
        return res.json(ApiResponse({}, "Participant role and user are required", false));
      }
    }

    const participant = await resolveParticipant(participantRole, participantId);
    if (!participant) {
      return res.json(ApiResponse({}, "Participant not found or inactive", false));
    }

    let relatedChild = req.body.relatedChild || null;
    if (relatedChild) {
      const child = await Children.findById(relatedChild).select("_id parent classroom");
      if (!child) {
        return res.json(ApiResponse({}, "Related student not found", false));
      }
      if (role === "PARENT" && String(child.parent) !== String(req.user._id)) {
        return res.status(403).json(ApiResponse({}, "Cannot link another parent's child", false));
      }
      relatedChild = child._id;
    }

    const ticketNumber = await generateTicketNumber();
    const ticket = await SupportTicket.create({
      ticketNumber,
      subject,
      category: CATEGORIES.includes(String(req.body.category || "").toUpperCase())
        ? String(req.body.category).toUpperCase()
        : "GENERAL",
      priority: PRIORITIES.includes(String(req.body.priority || "").toUpperCase())
        ? String(req.body.priority).toUpperCase()
        : "NORMAL",
      participantRole,
      participant: participant.doc._id,
      participantName: participant.name,
      relatedChild: relatedChild || null,
      relatedClassroom: req.body.relatedClassroom || null,
      createdByRole: role,
      createdBy: req.user._id,
      assignedAdmin: role === "ADMIN" ? req.user._id : null,
      lastMessageAt: new Date(),
      lastMessagePreview: initialMessage.slice(0, 160),
      adminUnreadCount: role === "ADMIN" ? 0 : 1,
      participantUnreadCount: role === "ADMIN" ? 1 : 0,
    });

    const sender = await resolveSenderSnapshot(req);
    const message = await SupportMessage.create({
      ticket: ticket._id,
      ...sender,
      body: initialMessage,
      isInternal: false,
    });

    const payload = {
      ticket: normalizeTicket(ticket.toObject(), req),
      message,
    };

    emitSupportTicketNew(payload);
    emitSupportMessage({
      ticketId: String(ticket._id),
      ticket: normalizeTicket(ticket.toObject(), req),
      message,
    });

    return res.status(201).json(ApiResponse(payload, "Support ticket created", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getAllTickets = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const match = await buildTicketFilter(req);

    const aggregate = [{ $match: match }, { $sort: { lastMessageAt: -1, updatedAt: -1 } }];

    if (req.query.keyword) {
      const regex = new RegExp(String(req.query.keyword).trim(), "i");
      aggregate.push({
        $match: {
          $or: [
            { subject: { $regex: regex } },
            { ticketNumber: { $regex: regex } },
            { participantName: { $regex: regex } },
            { lastMessagePreview: { $regex: regex } },
          ],
        },
      });
    }

    aggregate.push(
      {
        $lookup: {
          from: "childrens",
          localField: "relatedChild",
          foreignField: "_id",
          as: "relatedChild",
        },
      },
      {
        $unwind: {
          path: "$relatedChild",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "teachers",
          localField: "participant",
          foreignField: "_id",
          as: "participantTeacherDoc",
          pipeline: [{ $project: { image: 1 } }],
        },
      },
      {
        $lookup: {
          from: "parents",
          localField: "participant",
          foreignField: "_id",
          as: "participantParentDoc",
          pipeline: [{ $project: { image: 1 } }],
        },
      },
      {
        $addFields: {
          participantImage: {
            $cond: [
              { $eq: ["$participantRole", "TEACHER"] },
              {
                $let: {
                  vars: { row: { $arrayElemAt: ["$participantTeacherDoc", 0] } },
                  in: "$$row.image",
                },
              },
              {
                $let: {
                  vars: { row: { $arrayElemAt: ["$participantParentDoc", 0] } },
                  in: "$$row.image",
                },
              },
            ],
          },
        },
      },
      {
        $lookup: {
          from: "admins",
          localField: "assignedAdmin",
          foreignField: "_id",
          as: "assignedAdminDoc",
          pipeline: [{ $project: { firstName: 1, lastName: 1 } }],
        },
      },
      {
        $addFields: {
          assignedAdmin: {
            $let: {
              vars: { row: { $arrayElemAt: ["$assignedAdminDoc", 0] } },
              in: {
                $cond: [
                  { $ifNull: ["$$row", false] },
                  { _id: "$$row._id", firstName: "$$row.firstName", lastName: "$$row.lastName" },
                  "$assignedAdmin",
                ],
              },
            },
          },
        },
      },
      {
        $project: {
          participantTeacherDoc: 0,
          assignedAdminDoc: 0,
          participantParentDoc: 0,
        },
      }
    );

    const result = await SupportTicket.aggregatePaginate(SupportTicket.aggregate(aggregate), {
      page,
      limit,
    });

    if (result?.docs?.length) {
      result.docs = result.docs.map((item) => normalizeTicket(item, req));
    }

    return res.json(ApiResponse(result, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getTicketById = async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id)
      .populate("relatedChild", "firstName lastName rollNumber")
      .populate("relatedClassroom", "classroomName")
      .populate("assignedAdmin", "firstName lastName")
      .lean();

    if (!ticket) {
      return res.json(ApiResponse({}, "Ticket not found", false));
    }

    if (!canAccessTicket(req, ticket)) {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }

    const participant = await resolveParticipant(ticket.participantRole, ticket.participant);
    if (participant?.doc?.image) {
      ticket.participantImage = participant.doc.image;
    }

    return res.json(ApiResponse({ ticket: normalizeTicket(ticket, req) }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.updateTicket = async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) {
      return res.json(ApiResponse({}, "Ticket not found", false));
    }

    if (!canAccessTicket(req, ticket)) {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }

    const role = getRequestRole(req);
    const previousStatus = ticket.status;
    const previousPriority = ticket.priority;
    const previousAssignee = ticket.assignedAdmin ? String(ticket.assignedAdmin) : "";

    if (req.body.status && STATUSES.includes(String(req.body.status).toUpperCase())) {
      if (role !== "ADMIN" && !["RESOLVED", "CLOSED"].includes(String(req.body.status).toUpperCase())) {
        return res.status(403).json(ApiResponse({}, "Only admin can change ticket status", false));
      }
      ticket.status = String(req.body.status).toUpperCase();
    }

    if (role === "ADMIN") {
      if (req.body.priority && PRIORITIES.includes(String(req.body.priority).toUpperCase())) {
        ticket.priority = String(req.body.priority).toUpperCase();
      }
      if (req.body.category && CATEGORIES.includes(String(req.body.category).toUpperCase())) {
        ticket.category = String(req.body.category).toUpperCase();
      }
      if (req.body.assignedAdmin) {
        ticket.assignedAdmin = req.body.assignedAdmin;
      }
      if (req.body.takeOver) {
        ticket.assignedAdmin = req.user._id;
        if (ticket.status === "OPEN") ticket.status = "IN_PROGRESS";
      }
    }

    await ticket.save();

    if (role === "ADMIN") {
      const sender = await resolveSenderSnapshot(req);
      const actor = sender?.senderName || "Admin";
      const assignee = ticket.assignedAdmin ? String(ticket.assignedAdmin) : "";

      if (req.body.takeOver && assignee && assignee !== previousAssignee) {
        await recordTicketEvent(ticket, req, {
          eventType: "TAKEOVER",
          body: `${actor} has connected to take over ticket`,
        });
      }

      if (ticket.priority !== previousPriority) {
        await recordTicketEvent(ticket, req, {
          eventType: "PRIORITY",
          body: `${actor} changed priority to ${PRIORITY_LABELS[ticket.priority] || ticket.priority}`,
          eventMeta: { priority: ticket.priority },
        });
      }

      if (ticket.status !== previousStatus) {
        await recordTicketEvent(ticket, req, {
          eventType: "STATUS",
          body: `${actor} changed status to ${STATUS_LABELS[ticket.status] || ticket.status}`,
          eventMeta: { status: ticket.status },
        });
      }
    }

    const payload = { ticket: normalizeTicket(ticket.toObject(), req) };
    emitSupportTicketUpdated(payload);

    return res.json(ApiResponse(payload, "Ticket updated", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getTicketMessages = async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id).lean();
    if (!ticket) {
      return res.json(ApiResponse({}, "Ticket not found", false));
    }
    if (!canAccessTicket(req, ticket)) {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const role = getRequestRole(req);

    const query = { ticket: ticket._id };
    if (role !== "ADMIN") {
      query.isInternal = false;
    }

    const result = await SupportMessage.paginate(query, {
      page,
      limit,
      sort: { createdAt: 1 },
      lean: true,
    });

    return res.json(ApiResponse(result, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) {
      return res.json(ApiResponse({}, "Ticket not found", false));
    }
    if (!canAccessTicket(req, ticket)) {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }

    const body = String(req.body.body || req.body.message || "").trim();
    if (!body) {
      return res.json(ApiResponse({}, "Message body is required", false));
    }

    if (ticket.status === "CLOSED") {
      return res.json(ApiResponse({}, "This ticket is closed", false));
    }

    const role = getRequestRole(req);
    const isInternal = role === "ADMIN" && Boolean(req.body.isInternal);

    const sender = await resolveSenderSnapshot(req);
    const message = await SupportMessage.create({
      ticket: ticket._id,
      ...sender,
      body,
      isInternal,
    });

    ticket.lastMessageAt = new Date();
    ticket.lastMessagePreview = body.slice(0, 160);

    if (role === "ADMIN") {
      if (!isInternal) ticket.participantUnreadCount += 1;
      if (ticket.status === "RESOLVED") ticket.status = "IN_PROGRESS";
    } else {
      ticket.adminUnreadCount += 1;
      if (ticket.status === "WAITING" || ticket.status === "RESOLVED") {
        ticket.status = "OPEN";
      }
    }

    await ticket.save();

    const payload = {
      ticketId: String(ticket._id),
      ticket: normalizeTicket(ticket.toObject(), req),
      message,
    };

    emitSupportMessage(payload);
    emitSupportTicketUpdated({ ticket: payload.ticket });

    return res.status(201).json(ApiResponse(payload, "Message sent", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.markTicketRead = async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) {
      return res.json(ApiResponse({}, "Ticket not found", false));
    }
    if (!canAccessTicket(req, ticket)) {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }

    const role = getRequestRole(req);
    if (role === "ADMIN") {
      ticket.adminUnreadCount = 0;
    } else {
      ticket.participantUnreadCount = 0;
    }

    await ticket.save();

    const payload = { ticketId: String(ticket._id), ticket: normalizeTicket(ticket.toObject(), req) };
    emitSupportTicketUpdated(payload);

    return res.json(ApiResponse(payload, "Marked as read", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getUnreadTicketCount = async (req, res) => {
  try {
    const role = getRequestRole(req);
    const match = await buildTicketFilter(req);

    if (role === "ADMIN") {
      match.adminUnreadCount = { $gt: 0 };
    } else {
      match.participantUnreadCount = { $gt: 0 };
    }

    const count = await SupportTicket.countDocuments(match);
    return res.json(ApiResponse({ count }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.verifyTicketAccess = async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id).lean();
    if (!ticket) {
      return res.json(ApiResponse({}, "Ticket not found", false));
    }
    if (!canAccessTicket(req, ticket)) {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }
    return res.json(ApiResponse({ allowed: true, ticketId: String(ticket._id) }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.deleteTicket = async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) {
      return res.json(ApiResponse({}, "Ticket not found", false));
    }

    if (!canAccessTicket(req, ticket)) {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }

    if (ticket.status !== "CLOSED") {
      return res.json(ApiResponse({}, "Only closed tickets can be deleted", false));
    }

    const snapshot = ticket.toObject();
    await SupportMessage.deleteMany({ ticket: ticket._id });
    await ticket.deleteOne();

    emitSupportTicketUpdated({
      ticket: { ...normalizeTicket(snapshot, req), deleted: true },
      deleted: true,
    });

    return res.json(
      ApiResponse({ ticketId: String(snapshot._id), deleted: true }, "Ticket deleted", true)
    );
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};
