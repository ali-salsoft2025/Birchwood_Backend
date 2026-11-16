const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * One FCM registration token per physical app install.
 * Upserted by token string so reinstalls / refreshes replace cleanly.
 */
const deviceTokenSchema = new Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["parent", "teacher"],
      required: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ["ios", "android", "unknown"],
      default: "unknown",
    },
    app: {
      type: String,
      enum: ["student", "teacher"],
      required: true,
    },
  },
  { timestamps: true }
);

deviceTokenSchema.index({ user: 1, role: 1 });

module.exports = mongoose.model("deviceToken", deviceTokenSchema);
