const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const jobSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    department: { type: String, default: "", trim: true, maxlength: 80 },
    employmentType: {
      type: String,
      enum: ["FULL_TIME", "PART_TIME", "CONTRACT"],
      default: "FULL_TIME",
    },
    location: { type: String, default: "Campus", trim: true, maxlength: 80 },
    summary: { type: String, default: "", trim: true, maxlength: 280 },
    description: { type: String, default: "", trim: true, maxlength: 4000 },
    closingOn: { type: Date, default: null },
    status: {
      type: String,
      enum: ["OPEN", "CLOSED"],
      default: "OPEN",
    },
  },
  { timestamps: true }
);

jobSchema.index({ status: 1, closingOn: 1 });

module.exports = mongoose.model("job", jobSchema);
