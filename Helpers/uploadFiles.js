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

module.exports = { unlinkUploadedFile, resolveUploadPath, UPLOAD_DIR };
