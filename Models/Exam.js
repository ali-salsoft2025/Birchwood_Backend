const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate");
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");
const Schema = mongoose.Schema;

const subjectSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    maxMarks: { type: Number, required: true, min: 1, default: 100 },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const examSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    term: { type: String, required: true, trim: true },
    academicYear: { type: String, default: "" },
    classroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "classroom",
      required: true,
    },
    examDate: { type: Date, default: Date.now },
    subjects: { type: [subjectSchema], default: [] },
    status: {
      type: String,
      enum: ["DRAFT", "OPEN", "CLOSED", "PUBLISHED"],
      default: "DRAFT",
    },
    notes: { type: String, default: "" },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "admin",
    },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

examSchema.plugin(mongoosePaginate);
examSchema.plugin(aggregatePaginate);

module.exports = mongoose.model("exam", examSchema);
