const { unlinkUploadedFile } = require("./uploadFiles");

const PARENT_IMAGE_KEYS = ["fatherImage", "motherImage", "image"];

function assignParentImagesFromBody(data = {}) {
  if (!data.image && data.fatherImage) {
    data.image = data.fatherImage;
  }
  return data;
}

function replaceParentUploadedImages(current, updates = {}) {
  if (!current) return;
  const stale = new Set();
  PARENT_IMAGE_KEYS.forEach((key) => {
    if (updates[key] && current[key] && updates[key] !== current[key]) {
      stale.add(current[key]);
    }
  });
  PARENT_IMAGE_KEYS.forEach((key) => {
    if (updates[key]) stale.delete(updates[key]);
  });
  stale.forEach(unlinkUploadedFile);
}

function deleteParentUploadedImages(parent) {
  if (!parent) return;
  const files = new Set(
    PARENT_IMAGE_KEYS.map((key) => parent[key]).filter(Boolean)
  );
  files.forEach(unlinkUploadedFile);
}

module.exports = {
  PARENT_IMAGE_KEYS,
  assignParentImagesFromBody,
  replaceParentUploadedImages,
  deleteParentUploadedImages,
};
