const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const PROGRAMS = ["Creche", "Nursery 1", "Nursery 2", "Nursery 3", "Not sure yet"];

const enquirySchema = new Schema(
  {
    parentName: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 40 },
    childName: { type: String, default: "", trim: true, maxlength: 80 },
    childAge: { type: String, default: "", trim: true, maxlength: 40 },
    program: { type: String, required: true, enum: PROGRAMS },
    preferredVisit: { type: String, default: "", trim: true, maxlength: 80 },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    status: {
      type: String,
      enum: ["NEW", "CONTACTED", "CLOSED"],
      default: "NEW",
    },
  },
  { timestamps: true }
);

enquirySchema.index({ createdAt: -1 });
enquirySchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("enquiry", enquirySchema);
module.exports.PROGRAMS = PROGRAMS;
