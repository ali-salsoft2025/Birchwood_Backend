const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate");

const supportMessageSchema = new mongoose.Schema(
  {
    ticket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "supportTicket",
      required: true,
      index: true,
    },
    senderRole: {
      type: String,
      enum: ["ADMIN", "TEACHER", "PARENT"],
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    senderName: {
      type: String,
      default: "",
    },
    senderImage: {
      type: String,
      default: "",
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    isInternal: {
      type: Boolean,
      default: false,
    },
    kind: {
      type: String,
      enum: ["MESSAGE", "EVENT"],
      default: "MESSAGE",
    },
    eventType: {
      type: String,
      enum: ["TAKEOVER", "PRIORITY", "STATUS"],
    },
    eventMeta: {
      priority: { type: String, default: "" },
      status: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

supportMessageSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("supportMessage", supportMessageSchema);
