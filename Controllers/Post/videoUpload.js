const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ApiResponse } = require("../../Helpers/index");
const { UPLOAD_DIR } = require("../../Helpers/uploadFiles");

const CHUNK_SIZE = 512 * 1024;
const VIDEO_MAX = 100 * 1024 * 1024;
const SESSION_MS = 15 * 60 * 1000;
const READY_MS = 30 * 60 * 1000;

const KINDS = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

const MIME_EXT = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "video/x-m4v": ".m4v",
};

const sessions = new Map();
const ready = new Map();

function humanLimit(bytes) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function describe(fileName, mime) {
  const named = path.extname(String(fileName || "")).toLowerCase();
  const fromMime = MIME_EXT[String(mime || "").toLowerCase()];
  const ext = KINDS[named] ? named : fromMime;
  if (!ext || !KINDS[ext]) return null;
  return { ext, mime: KINDS[ext] };
}

function dropSession(uploadId, removeFile) {
  const session = sessions.get(uploadId);
  if (!session) return;
  sessions.delete(uploadId);
  clearTimeout(session.timer);
  if (session.stream && !session.stream.closed) session.stream.destroy();
  if (removeFile) fs.promises.unlink(session.full).catch(() => {});
}

function dropReady(name, removeFile) {
  const item = ready.get(name);
  if (!item) return;
  ready.delete(name);
  clearTimeout(item.timer);
  if (removeFile) fs.promises.unlink(item.full).catch(() => {});
}

exports.startPostVideo = async (req, res) => {
  const { fileName, mime, size } = req.body || {};
  const bytes = Number(size);
  try {
    const described = describe(fileName, mime);
    if (!described) {
      return res.status(400).json(ApiResponse({}, "Use an mp4, mov, or webm video", false));
    }
    if (!Number.isFinite(bytes) || bytes < 1 || bytes > VIDEO_MAX) {
      return res.status(400).json(ApiResponse({}, `Keep videos under ${humanLimit(VIDEO_MAX)}`, false));
    }
    await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
    const stored = `post-video-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${described.ext}`;
    const full = path.join(UPLOAD_DIR, stored);
    const stream = fs.createWriteStream(full, { flags: "a" });
    const uploadId = crypto.randomBytes(12).toString("hex");
    const timer = setTimeout(() => dropSession(uploadId, true), SESSION_MS);
    sessions.set(uploadId, {
      userId: String(req.user._id),
      size: bytes,
      stored,
      full,
      stream,
      received: 0,
      next: 0,
      timer,
    });
    return res.json(ApiResponse({ uploadId, chunkSize: CHUNK_SIZE, file: stored }, "Upload started", true));
  } catch (error) {
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};

exports.chunkPostVideo = async (req, res) => {
  const uploadId = String(req.get("x-upload-id") || "");
  const index = Number(req.get("x-chunk-index"));
  const session = sessions.get(uploadId);
  try {
    if (!session || session.userId !== String(req.user._id)) {
      return res.status(403).json(ApiResponse({}, "Upload not found", false));
    }
    if (index !== session.next) {
      return res.status(400).json(ApiResponse({}, "Send the video in order", false));
    }
    const chunk = req.body;
    if (!Buffer.isBuffer(chunk) || chunk.length < 1 || chunk.length > CHUNK_SIZE) {
      return res.status(400).json(ApiResponse({}, "That piece of the video is too large", false));
    }
    if (session.received + chunk.length > session.size) {
      dropSession(uploadId, true);
      return res.status(400).json(ApiResponse({}, "Video is larger than expected", false));
    }
    await new Promise((resolve, reject) => {
      session.stream.write(chunk, (error) => (error ? reject(error) : resolve()));
    });
    session.received += chunk.length;
    session.next += 1;
    clearTimeout(session.timer);
    session.timer = setTimeout(() => dropSession(uploadId, true), SESSION_MS);
    return res.json(ApiResponse({ received: session.received, total: session.size }, "Chunk saved", true));
  } catch (error) {
    dropSession(uploadId, true);
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};

exports.finishPostVideo = async (req, res) => {
  const uploadId = String((req.body || {}).uploadId || "");
  const session = sessions.get(uploadId);
  try {
    if (!session || session.userId !== String(req.user._id)) {
      return res.status(403).json(ApiResponse({}, "Upload not found", false));
    }
    if (session.received !== session.size) {
      return res.status(400).json(ApiResponse({}, "The video is still uploading", false));
    }
    await new Promise((resolve, reject) => {
      session.stream.end((error) => (error ? reject(error) : resolve()));
    });
    clearTimeout(session.timer);
    sessions.delete(uploadId);
    const stat = await fs.promises.stat(session.full);
    if (stat.size !== session.size) {
      await fs.promises.unlink(session.full).catch(() => {});
      return res.status(400).json(ApiResponse({}, "The video did not join completely", false));
    }
    const timer = setTimeout(() => dropReady(session.stored, true), READY_MS);
    ready.set(session.stored, {
      userId: session.userId,
      full: session.full,
      timer,
    });
    return res.json(ApiResponse({ file: session.stored }, "Video uploaded", true));
  } catch (error) {
    if (session) dropSession(uploadId, true);
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};

function listNames(raw) {
  let names = [];
  if (Array.isArray(raw)) names = raw;
  else if (typeof raw === "string" && raw.trim()) {
    try {
      names = JSON.parse(raw);
    } catch {
      throw new Error("Video upload was incomplete");
    }
  }
  if (!names || !names.length) return [];
  if (!Array.isArray(names)) throw new Error("Video upload was incomplete");
  return names.map((name) => path.basename(String(name || "")));
}

exports.listPostVideoNames = listNames;

/** Attach finished videos to a post. Names that were not just uploaded are rejected. */
exports.claimPostVideos = function claimPostVideos(userId, raw) {
  const list = listNames(raw);
  if (!list.length) return [];
  if (list.length > 10) throw new Error("You can add up to 10 videos");
  const owner = String(userId);
  for (const name of list) {
    const item = ready.get(name);
    if (!item || item.userId !== owner || !name.startsWith("post-video-")) {
      throw new Error("That video upload expired. Please add it again.");
    }
  }
  for (const name of list) {
    clearTimeout(ready.get(name).timer);
    ready.delete(name);
  }
  return list;
};
