const fs = require("fs");
const path = require("path");

const UPLOAD_DIR = path.join("Uploads");

function unlinkUploadedFile(filename) {
  if (!filename) return;
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) return;
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    console.error("Error deleting upload:", filename, err.message);
  }
}

module.exports = { unlinkUploadedFile, UPLOAD_DIR };
