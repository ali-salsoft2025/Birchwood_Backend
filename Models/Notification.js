const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate");
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");
const Schema = mongoose.Schema;

const notificationSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      default: "",
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    content: {
      type: String,
      required: false,
      default: "",
    },
    assignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
    pushNotification: {
      type: Boolean,
      default: false,
    },
    sendTo: {
      type: String,
      enum: ["ADMIN", "TEACHERS", "PARENTS", "ALL", "CUSTOM", "CLASSROOM"],
      default: "ADMIN",
    },
    targetTeachers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "teacher",
    }],
    targetParents: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "parent",
    }],
    targetClassroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "classroom",
    },
    broadcastId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "notification",
    },
    recipientRole: {
      type: String,
      enum: ["TEACHER", "PARENT", ""],
      default: "",
    },
    deliveryStatus: {
      type: String,
      enum: ["QUEUED", "PROCESSING", "COMPLETED", "FAILED", ""],
      default: "",
    },
    deliveryStats: {
      total: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    source: {
      type: String,
      enum: ["SYSTEM", "NOTICE"],
      default: "SYSTEM",
    },
    type: {
      type: String,
      enum: ["ALERT", "ANNOUNCEMENT", "NOTIFICATION"],
      default: "NOTIFICATION",
    },
  },
  { timestamps: true }
);

notificationSchema.plugin(mongoosePaginate);
notificationSchema.plugin(aggregatePaginate);
module.exports = mongoose.model("notification", notificationSchema);
