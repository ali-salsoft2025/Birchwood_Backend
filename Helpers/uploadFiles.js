const fs = require("fs");
const path = require("path");

const UPLOAD_DIR = path.resolve("Uploads");

function resolveUploadPath(filename) {
  if (!filename || typeof filename !== "string") {
    return null;
  }
  let name = filename.trim();
  try {
    if (/^https?:\/\//i.test(name)) {
      name = path.basename(new URL(name).pathname);
    }
  } catch {
    return null;
  }
  name = path.basename(name.replace(/\\/g, "/"));
  if (!name || name === "." || name === "..") {
    return null;
  }
  const filePath = path.resolve(UPLOAD_DIR, name);
  const root = UPLOAD_DIR.endsWith(path.sep) ? UPLOAD_DIR : UPLOAD_DIR + path.sep;
  if (filePath !== UPLOAD_DIR && !filePath.startsWith(root)) {
    return null;
  }
  return filePath;
}

function unlinkUploadedFile(filename) {
  const filePath = resolveUploadPath(filename);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (err) {
    console.error("Error deleting upload:", filename, err.message);
    return false;
  }
}

const VIDEO_TYPES = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
};

function videoType(name) {
  return VIDEO_TYPES[path.extname(String(name || "")).toLowerCase()] || "";
}

/**
 * Stream a video from disk. Range requests are honored in full so the player
 * can read the picture, while the file itself is never loaded into memory.
 */
function streamUploadedVideo(req, res, next) {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  let name = "";
  try {
    name = path.basename(decodeURIComponent(req.path || ""));
  } catch {
    return next();
  }
  const type = videoType(name);
  if (!type) return next();
  const filePath = resolveUploadPath(name);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return next();
  }

  const size = fs.statSync(filePath).size;
  if (size < 1) return next();
  const common = {
    "Accept-Ranges": "bytes",
    "Content-Type": type,
    "Cache-Control": "public, max-age=604800",
  };

  const sendStream = (start, end, status) => {
    const length = end - start + 1;
    res.writeHead(status, {
      ...common,
      "Content-Length": length,
      ...(status === 206 ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    });
    if (req.method === "HEAD") return res.end();
    const stream = fs.createReadStream(filePath, { start, end });
    const close = () => stream.destroy();
    res.on("close", close);
    stream.on("error", () => {
      res.removeListener("close", close);
      if (!res.headersSent) res.status(500).end();
      else res.destroy();
    });
    stream.pipe(res);
  };

  const range = req.headers.range;
  if (!range) return sendStream(0, size - 1, 200);

  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(range).trim());
  if (!match || (match[1] === "" && match[2] === "")) {
    res.writeHead(416, { "Content-Range": `bytes */${size}` });
    return res.end();
  }

  let start = 0;
  let end = size - 1;
  if (match[1] === "") {
    const suffix = parseInt(match[2], 10);
    if (!Number.isFinite(suffix)) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      return res.end();
    }
    start = Math.max(size - suffix, 0);
  } else {
    start = parseInt(match[1], 10);
    end = match[2] ? parseInt(match[2], 10) : size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) {
    res.writeHead(416, { "Content-Range": `bytes */${size}` });
    return res.end();
  }
  end = Math.min(end, size - 1);
  return sendStream(start, end, 206);
}

module.exports = { unlinkUploadedFile, resolveUploadPath, streamUploadedVideo, UPLOAD_DIR };
