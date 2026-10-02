const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const Admin = require("../Models/Admin");
const Parent = require("../Models/Parent");
const Teacher = require("../Models/Teacher");
const {
  verifyAdminToken,
  ADMIN_TOKEN_TYPE,
} = require("../Helpers");
const {
  initSocketEmitter,
  SOCKET_EVENTS,
  ROOMS,
  emitChatTyping,
} = require("../Helpers/socketEmitter");
const { loadTicketForAccess, canAccessTicket } = require("../Helpers/supportAccess");
const Chat = require("../Models/Chat");
const { getSocketCors } = require("./cors");

function normalizeToken(value) {
  if (!value) return "";
  return String(value).replace(/^Bearer\s+/i, "").trim();
}

async function resolveSocketUser(token) {
  const normalized = normalizeToken(token);
  if (!normalized) {
    throw new Error("Missing authentication token");
  }

  try {
    const adminDecoded = verifyAdminToken(normalized);
    if (adminDecoded.tokenType === ADMIN_TOKEN_TYPE && adminDecoded.role === "admin") {
      const admin = await Admin.findById(adminDecoded._id);
      if (!admin || admin.status !== "ACTIVE") {
        throw new Error("Admin account inactive");
      }
      return {
        role: "admin",
        userId: String(admin._id),
        user: admin,
      };
    }
  } catch (adminError) {
    // Fall through to parent/teacher token verification.
  }

  const decoded = jwt.verify(normalized, process.env.JWT_SECRET);
  if (decoded.tokenType === ADMIN_TOKEN_TYPE || decoded.role === "admin") {
    throw new Error("Invalid user token");
  }

  const parent = await Parent.findById(decoded._id);
  const teacher = await Teacher.findById(decoded._id);
  if (!parent && !teacher) {
    throw new Error("User not found");
  }

  return {
    role: parent ? "parent" : "teacher",
    userId: String((parent || teacher)._id),
    user: parent || teacher,
  };
}

function initSocket(server) {
  const io = new Server(server, {
    cors: getSocketCors(),
    transports: ["websocket", "polling"],
  });

  initSocketEmitter(io);

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const session = await resolveSocketUser(token);
      socket.data.role = session.role;
      socket.data.userId = session.userId;
      socket.data.user = session.user;
      next();
    } catch (error) {
      next(new Error(error.message || "Unauthorized socket connection"));
    }
  });

  io.on("connection", (socket) => {
    if (socket.data.role === "admin") {
      socket.join(ROOMS.admin);
    } else if (socket.data.userId) {
      socket.join(ROOMS.user(socket.data.userId));
    }

    socket.emit(SOCKET_EVENTS.CONNECTED, {
      ok: true,
      role: socket.data.role,
      userId: socket.data.userId,
    });

    socket.on(SOCKET_EVENTS.SUPPORT_JOIN, async (payload = {}, ack) => {
      try {
        const ticketId = payload.ticketId || payload.id;
        if (!ticketId) {
          throw new Error("Ticket id is required");
        }

        const ticket = await loadTicketForAccess(ticketId);
        if (!ticket) {
          throw new Error("Ticket not found");
        }

        const fakeReq = {
          isAdmin: socket.data.role === "admin",
          userRole: socket.data.role === "admin" ? "admin" : socket.data.role,
          user: socket.data.user,
          admin: socket.data.role === "admin" ? socket.data.user : null,
        };

        if (!canAccessTicket(fakeReq, ticket)) {
          throw new Error("Access denied");
        }

        socket.join(ROOMS.ticket(String(ticketId)));
        if (typeof ack === "function") {
          ack({ ok: true, ticketId: String(ticketId) });
        }
      } catch (error) {
        if (typeof ack === "function") {
          ack({ ok: false, message: error.message || "Unable to join ticket room" });
        }
      }
    });

    socket.on("join chat", async (chatId, ack) => {
      try {
        if (!chatId || !socket.data.userId) {
          throw new Error("Chat id is required");
        }
        const chat = await Chat.findById(chatId).select("teacher parent");
        if (!chat) {
          throw new Error("Chat not found");
        }
        const userId = String(socket.data.userId);
        const allowed =
          String(chat.teacher) === userId || String(chat.parent) === userId;
        if (!allowed) {
          throw new Error("Access denied");
        }
        socket.join(ROOMS.chat(String(chatId)));
        if (typeof ack === "function") ack({ ok: true });
      } catch (error) {
        if (typeof ack === "function") {
          ack({ ok: false, message: error.message || "Unable to join chat" });
        }
      }
    });

    socket.on("chat:typing", async (payload = {}) => {
      try {
        const chatId = String(payload.chatId || "");
        if (!chatId || !socket.data.userId) return;
        const chat = await Chat.findById(chatId).select("teacher parent").lean();
        if (!chat) return;
        const userId = String(socket.data.userId);
        const allowed =
          String(chat.teacher) === userId || String(chat.parent) === userId;
        if (!allowed) return;
        emitChatTyping(
          chatId,
          {
            userId,
            typing: Boolean(payload.typing),
            name: payload.name,
          },
          [chat.teacher, chat.parent],
          userId
        );
      } catch (error) {
        // Typing is best-effort and must not drop the socket.
      }
    });

    socket.on(SOCKET_EVENTS.SUPPORT_LEAVE, (payload = {}) => {
      const ticketId = payload.ticketId || payload.id;
      if (ticketId) {
        socket.leave(ROOMS.ticket(String(ticketId)));
      }
    });

    socket.on("disconnect", () => {
      // Rooms are cleared automatically on disconnect.
    });
  });

  return io;
}

module.exports = { initSocket };
