const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const DEFAULT_MODULES = {
  fees: true,
  gallery: true,
  ads: true,
  results: true,
  chat: true,
  assessments: true,
  register: true,
  notifications: true,
};

const LINKED_MODULES = [
  ["results", "assessments"],
];

const schoolSettingsSchema = new Schema(
  {
    key: { type: String, unique: true, default: "default" },
    modules: {
      fees: { type: Boolean, default: true },
      gallery: { type: Boolean, default: true },
      ads: { type: Boolean, default: true },
      results: { type: Boolean, default: true },
      chat: { type: Boolean, default: true },
      assessments: { type: Boolean, default: true },
      register: { type: Boolean, default: true },
      notifications: { type: Boolean, default: true },
    },
    timeZone: { type: String, default: "Asia/Karachi" },
    appInfo: {
      teacherVersion: { type: String, default: "" },
      parentVersion: { type: String, default: "" },
      privacyPolicy: { type: String, default: "" },
      termsOfUse: { type: String, default: "" },
    },
    teacherAttendance: {
      checkInMinutes: { type: Number, default: 7 * 60 },
      graceMinutes: { type: Number, default: 15 },
      checkOutMinutes: { type: Number, default: 14 * 60 },
      leaveQuota: {
        SICK: { type: Number, default: 8 },
        CASUAL: { type: Number, default: 8 },
        ANNUAL: { type: Number, default: 10 },
      },
    },
  },
  { timestamps: true }
);

schoolSettingsSchema.statics.DEFAULT_MODULES = DEFAULT_MODULES;
schoolSettingsSchema.statics.LINKED_MODULES = LINKED_MODULES;

schoolSettingsSchema.statics.applyLinks = function applyLinks(modules) {
  const next = { ...modules };
  LINKED_MODULES.forEach(([left, right]) => {
    const on = next[left] !== false && next[right] !== false;
    next[left] = on;
    next[right] = on;
  });
  return next;
};

schoolSettingsSchema.statics.getSingleton = async function getSingleton() {
  let doc = await this.findOne({ key: "default" });
  if (!doc) {
    doc = await this.create({ key: "default", modules: { ...DEFAULT_MODULES } });
  }
  return doc;
};

schoolSettingsSchema.statics.getModules = async function getModules() {
  const doc = await this.getSingleton();
  const stored = doc.modules?.toObject?.() || doc.modules || {};
  const modules = { ...DEFAULT_MODULES };
  Object.keys(DEFAULT_MODULES).forEach((key) => {
    if (typeof stored[key] === "boolean") {
      modules[key] = stored[key];
    }
  });
  return this.applyLinks(modules);
};

module.exports = mongoose.model("schoolSettings", schoolSettingsSchema);
