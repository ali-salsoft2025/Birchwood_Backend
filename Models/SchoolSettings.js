const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const DEFAULT_MODULES = {
  fees: true,
  gallery: true,
  ads: true,
  results: false,
  chat: true,
  assessments: false,
};

const schoolSettingsSchema = new Schema(
  {
    key: { type: String, unique: true, default: "default" },
    modules: {
      fees: { type: Boolean, default: true },
      gallery: { type: Boolean, default: true },
      ads: { type: Boolean, default: true },
      results: { type: Boolean, default: false },
      chat: { type: Boolean, default: true },
      assessments: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

schoolSettingsSchema.statics.DEFAULT_MODULES = DEFAULT_MODULES;

schoolSettingsSchema.statics.getSingleton = async function getSingleton() {
  let doc = await this.findOne({ key: "default" });
  if (!doc) {
    doc = await this.create({ key: "default", modules: { ...DEFAULT_MODULES } });
  }
  return doc;
};

schoolSettingsSchema.statics.getModules = async function getModules() {
  const doc = await this.getSingleton();
  const modules = {
    ...DEFAULT_MODULES,
    ...(doc.modules?.toObject?.() || doc.modules || {}),
  };
  // Montessori school — no exams / graded results in the product surface
  modules.results = false;
  modules.assessments = false;
  return modules;
};

module.exports = mongoose.model("schoolSettings", schoolSettingsSchema);
