const SAFE_IMAGE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

function cleanText(value, max) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, max);
}

function safeImageName(value) {
  const name = String(value || "");
  if (!SAFE_IMAGE.test(name) || name.includes("..")) return "";
  return name;
}

function isObjectId(value) {
  return OBJECT_ID.test(String(value || ""));
}

function publicGallery(doc) {
  const images = (doc.images || []).map(safeImageName).filter(Boolean);
  return {
    id: String(doc._id),
    title: cleanText(doc.title, 120),
    caption: cleanText(doc.caption, 400),
    images,
    cover: images[0] || "",
  };
}

function publicJob(doc, { includeDescription = false } = {}) {
  const closingOn = doc.closingOn ? new Date(doc.closingOn) : null;
  const job = {
    id: String(doc._id),
    title: cleanText(doc.title, 120),
    department: cleanText(doc.department, 80),
    employmentType: doc.employmentType || "FULL_TIME",
    location: cleanText(doc.location, 80),
    summary: cleanText(doc.summary, 280),
    closingOn: closingOn && !Number.isNaN(closingOn.getTime()) ? closingOn.toISOString() : null,
  };
  if (includeDescription) {
    job.description = cleanText(doc.description, 4000);
  }
  return job;
}

function jobIsOpen(doc, now = new Date()) {
  if (!doc || doc.status !== "OPEN") return false;
  if (!doc.closingOn) return true;
  const closing = new Date(doc.closingOn);
  if (Number.isNaN(closing.getTime())) return true;
  return closing.getTime() >= now.getTime();
}

module.exports = {
  SAFE_IMAGE,
  cleanText,
  safeImageName,
  isObjectId,
  publicGallery,
  publicJob,
  jobIsOpen,
};
