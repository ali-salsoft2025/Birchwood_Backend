const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const teacherDutyDaySchema = new Schema(
  {
    name: { type: String, default: "Special day" },
    startKey: { type: String, required: true },
    endKey: { type: String, required: true },
    checkInMinutes: { type: Number, required: true },
    checkOutMinutes: { type: Number, required: true },
  },
  { timestamps: true }
);

teacherDutyDaySchema.index({ startKey: 1, endKey: 1 });

module.exports = mongoose.model("teacherDutyDay", teacherDutyDaySchema);
