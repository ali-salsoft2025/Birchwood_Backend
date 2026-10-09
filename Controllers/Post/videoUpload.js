const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ApiResponse } = require("../../Helpers/index");
const { UPLOAD_DIR } = require("../../Helpers/uploadFiles");

const CHUNK_SIZE = 512 * 1024;
const VIDEO_MAX = 100 * 1024 * 1024;
const SESSION_MS = 24 * 60 * 60 * 1000;

const KINDS = {
  ".mp4": { mime: "video/mp4", kind: "video" },
  ".m4v": { mime: "video/mp4", kind: "video" },
  ".mov": { mime: "video/quicktime", kind: "video" },
  ".webm": { mime: "video/webm", kind: "video" },
  ".jpg": { mime: "image/jpeg", kind: "image" },
  ".jpeg": { mime: "image/jpeg", kind: "image" },
  ".png": { mime: "image/png", kind: "image" },
  ".webp": { mime: "image/webp", kind: "image" },
  ".gif": { mime: "image/gif", kind: "image" },
  ".heic": { mime: "image/heic", kind: "image" },
  ".heif": { mime: "image/heif", kind: "image" },
};

const MIME_EXT = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "video/x-m4v": ".m4v",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

const MAX_BYTES = {
  video: VIDEO_MAX,
  image: 40 * 1024 * 1024,
};

const SESSION_DIR = path.join(UPLOAD_DIR, "post-sessions");
const CLIENT_DIR = path.join(SESSION_DIR, "clients");

function humanLimit(bytes) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function describe(fileName, mime) {
  const named = path.extname(String(fileName || "")).toLowerCase();
  const fromMime = MIME_EXT[String(mime || "").toLowerCase()];
  const ext = KINDS[named] ? named : fromMime;
  const described = ext ? KINDS[ext] : null;
  if (!described) return null;
  return { ext, mime: described.mime, kind: described.kind };
}

function streamName(name) {
  return name.startsWith("post-video-") || name.startsWith("post-image-");
}

function safeToken(value) {
  const token = String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  return token || "";
}

function sessionFile(uploadId) {
  return path.join(SESSION_DIR, `${safeToken(uploadId)}.json`);
}

function clientFile(clientUploadId) {
  return path.join(CLIENT_DIR, `${safeToken(clientUploadId)}.txt`);
}

async function readJson(file) {
  try {
    const raw = await fs.promises.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeJson(file, value) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fs.promises.writeFile(temp, JSON.stringify(value), "utf8");
  await fs.promises.rename(temp, file);
}

async function removeSession(session, removeVideo) {
  if (!session) return;
  await fs.promises.unlink(sessionFile(session.uploadId)).catch(() => {});
  if (session.clientUploadId) {
    await fs.promises.unlink(clientFile(session.clientUploadId)).catch(() => {});
  }
  if (removeVideo && session.full) {
    await fs.promises.unlink(session.full).catch(() => {});
  }
}

function expired(session) {
  return !session || Date.now() - Number(session.updatedAt || 0) > SESSION_MS;
}

/** Drop a torn last chunk so the next resume starts on a whole piece. */
async function align(session) {
  let size = 0;
  try {
    size = (await fs.promises.stat(session.full)).size;
  } catch {
    return null;
  }
  const acknowledged = Number(session.received) || 0;
  if (size === acknowledged) return session;
  if (size > acknowledged) {
    await fs.promises.truncate(session.full, acknowledged).catch(() => {});
    return session;
  }
  const received = Math.floor(size / CHUNK_SIZE) * CHUNK_SIZE;
  if (size !== received) {
    await fs.promises.truncate(session.full, received).catch(() => {});
  }
  session.received = received;
  session.next = received / CHUNK_SIZE;
  session.updatedAt = Date.now();
  return session;
}

async function loadSession(uploadId) {
  const token = safeToken(uploadId);
  if (!token) return null;
  const session = await readJson(sessionFile(token));
  if (!session || session.uploadId !== token) return null;
  if (expired(session)) {
    await removeSession(session, true);
    return null;
  }
  const aligned = await align(session);
  if (!aligned) {
    await removeSession(session, true);
    return null;
  }
  await writeJson(sessionFile(token), aligned);
  return aligned;
}

async function loadByClient(clientUploadId) {
  const token = safeToken(clientUploadId);
  if (!token) return null;
  let uploadId = "";
  try {
    uploadId = String(await fs.promises.readFile(clientFile(token), "utf8")).trim();
  } catch {
    return null;
  }
  return loadSession(uploadId);
}

function publicSession(session) {
  return {
    uploadId: session.uploadId,
    chunkSize: CHUNK_SIZE,
    file: session.stored,
    received: session.received,
    total: session.size,
    next: session.next,
    complete: Boolean(session.complete),
  };
}

async function saveSession(session) {
  session.updatedAt = Date.now();
  await fs.promises.mkdir(SESSION_DIR, { recursive: true });
  await fs.promises.mkdir(CLIENT_DIR, { recursive: true });
  await writeJson(sessionFile(session.uploadId), session);
  if (session.clientUploadId) {
    await fs.promises.writeFile(clientFile(session.clientUploadId), session.uploadId, "utf8");
  }
}

exports.startPostVideo = async (req, res) => {
  const { fileName, mime, size, clientUploadId } = req.body || {};
  const bytes = Number(size);
  const clientKey = safeToken(clientUploadId);
  try {
    const described = describe(fileName, mime);
    if (!described) {
      return res.status(400).json(ApiResponse({}, "Use a photo or an mp4, mov, or webm video", false));
    }
    const limit = MAX_BYTES[described.kind] || VIDEO_MAX;
    if (!Number.isFinite(bytes) || bytes < 1 || bytes > limit) {
      return res.status(400).json(ApiResponse({}, `Keep ${described.kind === "image" ? "photos" : "videos"} under ${humanLimit(limit)}`, false));
    }
    if (clientKey) {
      const existing = await loadByClient(clientKey);
      if (
        existing &&
        existing.userId === String(req.user._id) &&
        existing.size === bytes
      ) {
        return res.json(ApiResponse(publicSession(existing), "Upload resumed", true));
      }
    }
    await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
    const stored = `post-${described.kind}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${described.ext}`;
    const full = path.join(UPLOAD_DIR, stored);
    await fs.promises.writeFile(full, Buffer.alloc(0));
    const uploadId = crypto.randomBytes(12).toString("hex");
    const session = {
      uploadId,
      clientUploadId: clientKey,
      userId: String(req.user._id),
      size: bytes,
      stored,
      full,
      received: 0,
      next: 0,
      complete: false,
      claimed: false,
      updatedAt: Date.now(),
    };
    await saveSession(session);
    return res.json(ApiResponse(publicSession(session), "Upload started", true));
  } catch (error) {
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};

exports.statusPostVideo = async (req, res) => {
  try {
    const session = await loadSession(req.params.uploadId);
    if (!session || session.userId !== String(req.user._id)) {
      return res.status(404).json(ApiResponse({}, "Upload not found", false));
    }
    return res.json(ApiResponse(publicSession(session), "Upload status", true));
  } catch (error) {
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};

exports.chunkPostVideo = async (req, res) => {
  const uploadId = String(req.get("x-upload-id") || "");
  const index = Number(req.get("x-chunk-index"));
  try {
    const session = await loadSession(uploadId);
    if (!session || session.userId !== String(req.user._id)) {
      return res.status(403).json(ApiResponse({}, "Upload not found", false));
    }
    if (session.complete) {
      return res.json(ApiResponse(publicSession(session), "Chunk saved", true));
    }
    if (!Number.isInteger(index) || index < 0) {
      return res.status(400).json(ApiResponse(publicSession(session), "Send the video in order", false));
    }
    if (index < session.next) {
      return res.json(ApiResponse(publicSession(session), "Chunk saved", true));
    }
    if (index !== session.next) {
      return res.status(409).json(ApiResponse(publicSession(session), "Send the video in order", false));
    }
    const chunk = req.body;
    if (!Buffer.isBuffer(chunk) || chunk.length < 1 || chunk.length > CHUNK_SIZE) {
      return res.status(400).json(ApiResponse({}, "That piece of the video is too large", false));
    }
    if (session.received + chunk.length > session.size) {
      await removeSession(session, true);
      return res.status(400).json(ApiResponse({}, "Video is larger than expected", false));
    }
    await fs.promises.appendFile(session.full, chunk);
    session.received += chunk.length;
    session.next += 1;
    await saveSession(session);
    return res.json(ApiResponse(publicSession(session), "Chunk saved", true));
  } catch (error) {
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};

exports.finishPostVideo = async (req, res) => {
  const uploadId = String((req.body || {}).uploadId || "");
  try {
    const session = await loadSession(uploadId);
    if (!session || session.userId !== String(req.user._id)) {
      return res.status(403).json(ApiResponse({}, "Upload not found", false));
    }
    if (session.complete) {
      return res.json(ApiResponse({ file: session.stored, ...publicSession(session) }, "Video uploaded", true));
    }
    if (session.received !== session.size) {
      return res.status(400).json(ApiResponse(publicSession(session), "The video is still uploading", false));
    }
    const stat = await fs.promises.stat(session.full);
    if (stat.size !== session.size) {
      return res.status(400).json(ApiResponse({}, "The video did not join completely", false));
    }
    session.complete = true;
    await saveSession(session);
    return res.json(ApiResponse({ file: session.stored }, "Video uploaded", true));
  } catch (error) {
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

async function sessionForFile(userId, name) {
  if (!streamName(name)) return null;
  let entries = [];
  try {
    entries = await fs.promises.readdir(SESSION_DIR);
  } catch {
    return null;
  }
  const owner = String(userId);
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const session = await readJson(path.join(SESSION_DIR, entry));
    if (!session || session.stored !== name || session.userId !== owner) continue;
    if (!session.complete || session.claimed || expired(session)) return null;
    return session;
  }
  return null;
}

async function readyPostVideos(userId, raw) {
  const list = listNames(raw);
  if (!list.length) return [];
  if (list.length > 10) throw new Error("You can add up to 10 videos");
  for (const name of list) {
    const session = await sessionForFile(userId, name);
    if (!session) {
      throw new Error("That video upload expired. Please add it again.");
    }
  }
  return list;
}

/** Attach finished videos to a post. Names that were not just uploaded are rejected. */
exports.claimPostVideos = async function claimPostVideos(userId, raw) {
  const list = await readyPostVideos(userId, raw);
  for (const name of list) {
    const session = await sessionForFile(userId, name);
    if (!session) continue;
    session.claimed = true;
    session.updatedAt = Date.now();
    await writeJson(sessionFile(session.uploadId), session);
  }
  return list;
};

exports.readyPostVideos = readyPostVideos;

exports.cancelPostVideo = async (req, res) => {
  const clientUploadId = safeToken((req.body || {}).clientUploadId);
  const uploadId = safeToken((req.body || {}).uploadId);
  try {
    const session = uploadId ? await loadSession(uploadId) : await loadByClient(clientUploadId);
    if (!session || session.userId !== String(req.user._id)) {
      return res.json(ApiResponse({}, "Upload not found", true));
    }
    if (session.claimed) {
      return res.json(ApiResponse({}, "Upload already posted", true));
    }
    await removeSession(session, true);
    return res.json(ApiResponse({}, "Upload cancelled", true));
  } catch (error) {
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};
