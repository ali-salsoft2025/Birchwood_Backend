const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Chat = require("../../Models/Chat");
const Message = require("../../Models/Message");
const { ApiResponse } = require("../../Helpers/index");
const { emitChatMessage } = require("../../Helpers/socketEmitter");

const CHUNK_SIZE = 48 * 1024;
const IMAGE_MAX = 800 * 1024;
const DOCUMENT_MAX = 2 * 1024 * 1024;
const UPLOAD_DIR = path.join(__dirname, "..", "..", "Uploads");
const sessions = new Map();

const KINDS = {
  ".jpg": { mime: "image/jpeg", max: IMAGE_MAX },
  ".jpeg": { mime: "image/jpeg", max: IMAGE_MAX },
  ".png": { mime: "image/png", max: IMAGE_MAX },
  ".webp": { mime: "image/webp", max: IMAGE_MAX },
  ".pdf": { mime: "application/pdf", max: DOCUMENT_MAX },
  ".txt": { mime: "text/plain", max: DOCUMENT_MAX },
  ".doc": { mime: "application/msword", max: DOCUMENT_MAX },
  ".docx": {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    max: DOCUMENT_MAX,
  },
  ".xls": { mime: "application/vnd.ms-excel", max: DOCUMENT_MAX },
  ".xlsx": {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    max: DOCUMENT_MAX,
  },
  ".ppt": { mime: "application/vnd.ms-powerpoint", max: DOCUMENT_MAX },
  ".pptx": {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    max: DOCUMENT_MAX,
  },
  ".m4a": { mime: "audio/mp4", max: DOCUMENT_MAX },
  ".aac": { mime: "audio/aac", max: DOCUMENT_MAX },
  ".mp3": { mime: "audio/mpeg", max: DOCUMENT_MAX },
  ".wav": { mime: "audio/wav", max: DOCUMENT_MAX },
  ".mp4": { mime: "audio/mp4", max: DOCUMENT_MAX },
};

const MIME_EXT = Object.entries(KINDS).reduce((map, [ext, kind]) => {
  map[kind.mime] = ext;
  return map;
}, { "image/jpg": ".jpg" });

function isChatMember(req, chat) {
  if (!chat || !req?.user?._id) return false;
  const userId = String(req.user._id);
  return String(chat.teacher) === userId || String(chat.parent) === userId;
}

function memberRole(req, chat) {
  if (String(chat.teacher) === String(req.user._id)) return "teacher";
  if (String(chat.parent) === String(req.user._id)) return "parent";
  return "";
}

function describeFile(fileName, mime) {
  const namedExt = path.extname(String(fileName || "")).toLowerCase();
  const mimeExt = MIME_EXT[String(mime || "").toLowerCase()];
  const ext = KINDS[namedExt] ? namedExt : mimeExt;
  const kind = ext ? KINDS[ext] : null;
  if (!kind) return null;
  return { ext, mime: kind.mime, max: kind.max };
}

function storedName(ext) {
  return `chat-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
}

function dropSession(uploadId, removeFile) {
  const session = sessions.get(uploadId);
  if (!session) return;
  sessions.delete(uploadId);
  clearTimeout(session.timer);
  if (session.stream && !session.stream.closed) {
    session.stream.destroy();
  }
  if (removeFile) {
    fs.promises.unlink(session.full).catch(() => {});
  }
}

exports.startAttachment = async (req, res) => {
  const { chatId, fileName, mime, size, duration, waveform } = req.body || {};
  const bytes = Number(size);
  const seconds = Math.max(0, Math.round(Number(duration) || 0));
  const wave = Array.isArray(waveform)
    ? waveform.slice(0, 48).map((bar) => Math.max(0, Math.min(100, Math.round(Number(bar) || 0))))
    : [];
  try {
    const described = describeFile(fileName, mime);
    if (!described) {
      return res.status(400).json(ApiResponse({}, "Attach a photo or a document", false));
    }
    if (!Number.isFinite(bytes) || bytes < 1 || bytes > described.max) {
      const limit = described.max === IMAGE_MAX ? "800 KB" : "2 MB";
      return res.status(400).json(ApiResponse({}, `Keep this file under ${limit}`, false));
    }
    const chat = await Chat.findById(chatId).select("teacher parent");
    if (!chat) {
      return res.json(ApiResponse({}, "Chat not Found", false));
    }
    if (!isChatMember(req, chat)) {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }

    await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
    const stored = storedName(described.ext);
    const full = path.join(UPLOAD_DIR, stored);
    const stream = fs.createWriteStream(full, { flags: "a" });
    const uploadId = crypto.randomBytes(12).toString("hex");
    const timer = setTimeout(() => dropSession(uploadId, true), 2 * 60 * 1000);
    sessions.set(uploadId, {
      userId: String(req.user._id),
      chatId: String(chatId),
      fileName: String(fileName || `file${described.ext}`).slice(0, 120),
      mime: described.mime,
      size: bytes,
      duration: seconds,
      waveform: wave,
      stored,
      full,
      stream,
      received: 0,
      next: 0,
      timer,
    });
    return res.json(ApiResponse({ uploadId, chunkSize: CHUNK_SIZE }, "Upload started", true));
  } catch (error) {
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};

exports.chunkAttachment = async (req, res) => {
  const uploadId = String(req.get("x-upload-id") || "");
  const index = Number(req.get("x-chunk-index"));
  const session = sessions.get(uploadId);
  try {
    if (!session || session.userId !== String(req.user._id)) {
      return res.status(403).json(ApiResponse({}, "Upload not found", false));
    }
    if (index !== session.next) {
      return res.status(400).json(ApiResponse({}, "Send the file in order", false));
    }
    const chunk = req.body;
    if (!Buffer.isBuffer(chunk) || chunk.length < 1 || chunk.length > CHUNK_SIZE) {
      return res.status(400).json(ApiResponse({}, "That piece of the file is too large", false));
    }
    if (session.received + chunk.length > session.size) {
      dropSession(uploadId, true);
      return res.status(400).json(ApiResponse({}, "File is larger than expected", false));
    }
    await new Promise((resolve, reject) => {
      session.stream.write(chunk, (error) => (error ? reject(error) : resolve()));
    });
    session.received += chunk.length;
    session.next += 1;
    clearTimeout(session.timer);
    session.timer = setTimeout(() => dropSession(uploadId, true), 2 * 60 * 1000);
    return res.json(ApiResponse({ received: session.received, total: session.size }, "Chunk saved", true));
  } catch (error) {
    dropSession(uploadId, true);
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};

exports.finishAttachment = async (req, res) => {
  const { uploadId } = req.body || {};
  const session = sessions.get(String(uploadId || ""));
  try {
    if (!session || session.userId !== String(req.user._id)) {
      return res.status(403).json(ApiResponse({}, "Upload not found", false));
    }
    if (session.received !== session.size) {
      return res.status(400).json(ApiResponse({}, "The file is still uploading", false));
    }
    await new Promise((resolve, reject) => {
      session.stream.end((error) => (error ? reject(error) : resolve()));
    });
    clearTimeout(session.timer);
    sessions.delete(String(uploadId));
    const stat = await fs.promises.stat(session.full);
    if (stat.size !== session.size) {
      await fs.promises.unlink(session.full).catch(() => {});
      return res.status(400).json(ApiResponse({}, "The file did not join completely", false));
    }

    const chat = await Chat.findById(session.chatId);
    if (!chat || !isChatMember(req, chat)) {
      await fs.promises.unlink(session.full).catch(() => {});
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }
    const senderType = memberRole(req, chat);
    const message = new Message({
      senderType,
      content: "",
      sender: req.user._id,
      chat: chat._id,
      attachment: {
        name: session.fileName,
        mime: session.mime,
        size: session.size,
        file: session.stored,
        duration: session.duration || 0,
        waveform: session.waveform || [],
      },
    });
    await message.save();
    chat.latestMessage = message._id;
    chat.hiddenFor = (chat.hiddenFor || []).filter(
      (id) => String(id) !== String(chat.teacher) && String(id) !== String(chat.parent)
    );
    if (senderType === "teacher") {
      chat.parentUnread = (chat.parentUnread || 0) + 1;
      chat.unreadMessage = chat.parentUnread;
    } else if (senderType === "parent") {
      chat.teacherUnread = (chat.teacherUnread || 0) + 1;
    }
    await chat.save();
    const payload = message.toObject();
    emitChatMessage(String(chat._id), payload, [chat.teacher, chat.parent]);
    return res.json(ApiResponse({ message }, "File sent", true));
  } catch (error) {
    if (session) dropSession(String(uploadId), true);
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};
