const SOCKET_EVENTS = {
  NOTIFICATION_NEW: "notification:new",
  NOTIFICATION_READ: "notification:read",
  NOTIFICATION_DELETED: "notification:deleted",
  CONNECTED: "connected",
  SUPPORT_TICKET_NEW: "support:ticket:new",
  SUPPORT_TICKET_UPDATED: "support:ticket:updated",
  SUPPORT_MESSAGE_NEW: "support:message:new",
  SUPPORT_JOIN: "support:join",
  SUPPORT_LEAVE: "support:leave",
};

const ROOMS = {
  admin: "admin",
  user: (userId) => `user:${userId}`,
  ticket: (ticketId) => `ticket:${ticketId}`,
  chat: (chatId) => `chat:${chatId}`,
};

let io = null;

function initSocketEmitter(ioInstance) {
  io = ioInstance;
}

function getIo() {
  return io;
}

function emitToAdmin(event, payload) {
  if (!io) return;
  io.to(ROOMS.admin).emit(event, payload);
}

function emitToUser(userId, event, payload) {
  if (!io || !userId) return;
  io.to(ROOMS.user(userId)).emit(event, payload);
}

function emitToTicket(ticketId, event, payload) {
  if (!io || !ticketId) return;
  io.to(ROOMS.ticket(ticketId)).emit(event, payload);
}

function emitChatMessage(chatId, message) {
  if (!io || !chatId || !message) return;
  io.to(ROOMS.chat(chatId)).emit("message", message);
}

function emitAdminNotification(notification) {
  emitToAdmin(SOCKET_EVENTS.NOTIFICATION_NEW, {
    notification,
    audience: "admin",
  });
}

function emitUserNotification(userId, notification) {
  emitToUser(userId, SOCKET_EVENTS.NOTIFICATION_NEW, {
    notification,
    audience: "user",
  });
}

function emitAdminNotificationRead(payload) {
  emitToAdmin(SOCKET_EVENTS.NOTIFICATION_READ, payload);
}

function emitUserNotificationRead(userId, payload) {
  const normalized =
    typeof payload === "object" && payload !== null
      ? payload
      : { id: payload, isRead: true };
  emitToUser(userId, SOCKET_EVENTS.NOTIFICATION_READ, normalized);
}

function emitUserNotificationDeleted(userId, payload) {
  if (!userId || !payload) return;
  emitToUser(userId, SOCKET_EVENTS.NOTIFICATION_DELETED, payload);
}

function emitSupportTicketNew(payload) {
  emitToAdmin(SOCKET_EVENTS.SUPPORT_TICKET_NEW, payload);
  const participantId = payload?.ticket?.participant;
  if (participantId) {
    emitToUser(String(participantId), SOCKET_EVENTS.SUPPORT_TICKET_NEW, payload);
  }
}

function emitSupportTicketUpdated(payload) {
  const ticket = payload?.ticket;
  if (!ticket) return;

  emitToAdmin(SOCKET_EVENTS.SUPPORT_TICKET_UPDATED, payload);
  emitToUser(String(ticket.participant), SOCKET_EVENTS.SUPPORT_TICKET_UPDATED, payload);
  emitToTicket(String(ticket._id), SOCKET_EVENTS.SUPPORT_TICKET_UPDATED, payload);
}

function emitSupportMessage(payload) {
  const ticket = payload?.ticket;
  const ticketId = payload?.ticketId || ticket?._id;
  if (!ticketId) return;

  emitToTicket(String(ticketId), SOCKET_EVENTS.SUPPORT_MESSAGE_NEW, payload);
  emitToAdmin(SOCKET_EVENTS.SUPPORT_MESSAGE_NEW, payload);

  if (ticket?.participant) {
    emitToUser(String(ticket.participant), SOCKET_EVENTS.SUPPORT_MESSAGE_NEW, payload);
  }
}

module.exports = {
  SOCKET_EVENTS,
  ROOMS,
  initSocketEmitter,
  getIo,
  emitToAdmin,
  emitToUser,
  emitToTicket,
  emitChatMessage,
  emitAdminNotification,
  emitUserNotification,
  emitAdminNotificationRead,
  emitUserNotificationRead,
  emitUserNotificationDeleted,
  emitSupportTicketNew,
  emitSupportTicketUpdated,
  emitSupportMessage,
};
