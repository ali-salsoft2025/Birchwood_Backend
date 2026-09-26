const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const assessmentMarkSchema = new Schema(
  {
    assessment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "assessment",
      required: true,
      index: true,
    },
    children: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "children",
      required: true,
      index: true,
    },
    obtained: { type: Number, required: true, min: 0 },
    remarks: { type: String, default: "" },
    enteredBy: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true }
);

assessmentMarkSchema.index({ assessment: 1, children: 1 }, { unique: true });

module.exports = mongoose.model("assessmentMark", assessmentMarkSchema);
