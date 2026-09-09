const SupportTicket = require("../Models/SupportTicket");
const Teacher = require("../Models/Teacher");
const Parent = require("../Models/Parent");
const Admin = require("../Models/Admin");
const Children = require("../Models/Children");

function displayTeacherName(teacher) {
  if (!teacher) return "Teacher";
  return `${teacher.firstName || ""} ${teacher.lastName || ""}`.trim() || "Teacher";
}

function displayParentName(parent) {
  if (!parent) return "Parent";
  const father = `${parent.fatherFirstName || ""} ${parent.fatherLastName || ""}`.trim();
  if (father) return father;
  return `${parent.motherFirstName || ""} ${parent.motherLastName || ""}`.trim() || "Parent";
}

function displayAdminName(admin) {
  if (!admin) return "Admin";
  return `${admin.firstName || ""} ${admin.lastName || ""}`.trim() || "Admin";
}

function getRequestRole(req) {
  if (req.isAdmin) return "ADMIN";
  if (req.userRole === "teacher") return "TEACHER";
  if (req.userRole === "parent") return "PARENT";
  return null;
}

function canAccessTicket(req, ticket) {
  if (!ticket || !req?.user?._id) return false;
  const role = getRequestRole(req);
  const userId = String(req.user._id);

  if (role === "ADMIN") return true;

  if (String(ticket.createdBy) === userId) return true;

  if (
    role === "TEACHER" &&
    ticket.participantRole === "TEACHER" &&
    String(ticket.participant) === userId
  ) {
    return true;
  }

  if (
    role === "PARENT" &&
    ticket.participantRole === "PARENT" &&
    String(ticket.participant) === userId
  ) {
    return true;
  }

  return false;
}

async function loadTicketForAccess(ticketId) {
  if (!ticketId) return null;
  return SupportTicket.findById(ticketId).lean();
}

async function resolveParticipant(participantRole, participantId) {
  if (participantRole === "TEACHER") {
    const teacher = await Teacher.findById(participantId).select("_id firstName lastName image status");
    if (!teacher || teacher.status !== "ACTIVE") return null;
    return { doc: teacher, name: displayTeacherName(teacher) };
  }

  if (participantRole === "PARENT") {
    const parent = await Parent.findById(participantId).select(
      "_id fatherFirstName fatherLastName motherFirstName motherLastName image fatherImage motherImage status"
    );
    if (!parent || parent.status !== "ACTIVE") return null;
    return { doc: parent, name: displayParentName(parent) };
  }

  return null;
}

async function resolveSenderSnapshot(req) {
  const role = getRequestRole(req);
  if (role === "ADMIN") {
    const admin = req.admin || req.user;
    return {
      senderRole: "ADMIN",
      sender: admin._id,
      senderName: displayAdminName(admin),
    };
  }

  if (role === "TEACHER") {
    return {
      senderRole: "TEACHER",
      sender: req.user._id,
      senderName: displayTeacherName(req.user),
    };
  }

  if (role === "PARENT") {
    return {
      senderRole: "PARENT",
      sender: req.user._id,
      senderName: displayParentName(req.user),
    };
  }

  return null;
}

async function buildTicketFilter(req) {
  const role = getRequestRole(req);
  const userId = req.user._id;

  if (role === "ADMIN") {
    const match = {};
    if (req.query.status) match.status = req.query.status;
    if (req.query.participantRole) match.participantRole = req.query.participantRole;
    if (req.query.category) match.category = req.query.category;
    return match;
  }

  if (role === "TEACHER") {
    return {
      $or: [
        { createdBy: userId, createdByRole: "TEACHER" },
        { participantRole: "TEACHER", participant: userId },
      ],
    };
  }

  if (role === "PARENT") {
    return {
      $or: [
        { createdBy: userId, createdByRole: "PARENT" },
        { participantRole: "PARENT", participant: userId },
      ],
    };
  }

  return { _id: null };
}

async function generateTicketNumber() {
  const count = await SupportTicket.countDocuments();
  const seq = String(count + 1).padStart(6, "0");
  return `BW-TKT-${seq}`;
}

module.exports = {
  displayTeacherName,
  displayParentName,
  displayAdminName,
  getRequestRole,
  canAccessTicket,
  loadTicketForAccess,
  resolveParticipant,
  resolveSenderSnapshot,
  buildTicketFilter,
  generateTicketNumber,
};
