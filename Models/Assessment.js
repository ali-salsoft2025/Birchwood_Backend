const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate");
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");
const Schema = mongoose.Schema;

const KINDS = ["EXAM", "TEST", "QUIZ", "ASSIGNMENT"];

const assessmentSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    kind: {
      type: String,
      enum: KINDS,
      default: "TEST",
    },
    /** Optional topic label (e.g. Maths) — not a multi-subject marksheet */
    subject: { type: String, default: "", trim: true },
    notes: { type: String, default: "" },
    classroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "classroom",
      required: true,
    },
    maxMarks: { type: Number, required: true, min: 1, default: 100 },
    assessmentDate: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED"],
      default: "DRAFT",
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "teacher",
    },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

assessmentSchema.statics.KINDS = KINDS;

assessmentSchema.plugin(mongoosePaginate);
assessmentSchema.plugin(aggregatePaginate);

module.exports = mongoose.model("assessment", assessmentSchema);
