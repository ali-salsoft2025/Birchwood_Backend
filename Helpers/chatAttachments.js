const fs = require("fs");
const path = require("path");
const Message = require("../Models/Message");

const UPLOAD_DIR = path.join(__dirname, "..", "Uploads");
const DEFAULT_RETENTION_DAYS = 30;
const BATCH_SIZE = 200;

function retentionDays(override) {
  const raw =
    override !== undefined && override !== null
      ? override
      : process.env.CHAT_ATTACHMENT_RETENTION_DAYS;
  const days = Number(raw);
  if (!Number.isFinite(days) || days < 1) {
    return DEFAULT_RETENTION_DAYS;
  }
  return Math.floor(days);
}

function uploadPath(fileName) {
  const base = path.basename(String(fileName || ""));
  if (!base || base === "." || base === "..") {
    return "";
  }
  return path.join(UPLOAD_DIR, base);
}

async function removeUploadFile(fileName) {
  const full = uploadPath(fileName);
  if (!full) {
    return false;
  }
  try {
    await fs.promises.unlink(full);
    return true;
  } catch {
    return false;
  }
}

function clearAttachmentFields(attachment = {}) {
  // Keep `file` (basename) so clients can still open a previously downloaded
  // local copy after the Uploads original is removed.
  return {
    name: attachment.name || "",
    mime: attachment.mime || "",
    size: 0,
    file: attachment.file || "",
    duration: attachment.duration || 0,
    waveform: Array.isArray(attachment.waveform) ? attachment.waveform : [],
    expired: true,
  };
}

/** Remove the Uploads file when no chat member still has the message. */
async function purgeAttachmentIfOrphaned(message, chat) {
  const fileName = message?.attachment?.file;
  if (!fileName) {
    return false;
  }
  const members = [String(chat?.teacher || ""), String(chat?.parent || "")].filter(Boolean);
  if (!members.length) {
    return false;
  }
  const deletedFor = (message.deletedFor || []).map(id => String(id));
  const bothDeleted =
    Boolean(message.deletedForEveryone) ||
    members.every(id => deletedFor.includes(id));
  if (!bothDeleted) {
    return false;
  }
  await removeUploadFile(fileName);
  message.attachment = clearAttachmentFields(message.attachment);
  return true;
}

/**
 * Drop chat attachment files older than the retention window from disk.
 * Messages keep mime/name so apps can show "no longer available".
 */
async function purgeExpiredChatAttachments(options = {}) {
  const days = retentionDays(options.days);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  let purged = 0;

  for (;;) {
    const stale = await Message.find({
      createdAt: { $lt: cutoff },
      "attachment.file": { $exists: true, $nin: ["", null] },
      "attachment.expired": { $ne: true },
    })
      .select("attachment")
      .limit(BATCH_SIZE);

    if (!stale.length) {
      break;
    }

    for (const message of stale) {
      const fileName = message.attachment?.file;
      if (fileName) {
        await removeUploadFile(fileName);
      }
      message.attachment = clearAttachmentFields(message.attachment);
      await message.save();
      purged += 1;
    }
  }

  return { purged, days };
}

module.exports = {
  purgeAttachmentIfOrphaned,
  purgeExpiredChatAttachments,
  removeUploadFile,
  clearAttachmentFields,
  retentionDays,
};
