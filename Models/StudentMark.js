const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const studentMarkSchema = new Schema(
  {
    exam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "exam",
      required: true,
      index: true,
    },
    children: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "children",
      required: true,
      index: true,
    },
    subject: { type: String, required: true, trim: true },
    obtained: { type: Number, required: true, min: 0 },
    remarks: { type: String, default: "" },
    enteredBy: { type: mongoose.Schema.Types.ObjectId },
    enteredByRole: {
      type: String,
      enum: ["ADMIN", "TEACHER"],
      default: "ADMIN",
    },
  },
  { timestamps: true }
);

studentMarkSchema.index({ exam: 1, children: 1, subject: 1 }, { unique: true });

module.exports = mongoose.model("studentMark", studentMarkSchema);
