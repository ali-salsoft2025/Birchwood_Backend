const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate");
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");
const Schema = mongoose.Schema;

const teacherAttendanceSchema = new Schema(
  {
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "teacher",
    },
    checkIn: {
      type: Date,
      default: "",
    },
   
    checkOut: {
      type: Date,
      default: "",
    },
    leaveReason: {
      type: String,
      default: "",
    },
    sickDescription: {
      type: String,
      default: "",
    },
    leaveType:{
      type: String,
      enum: ["SICK", "CASUAL", "ANNUAL"],
    },
    status: {
      type: String,
      enum: ["PRESENT", "ABSENT", "LEAVE", "HOLIDAY"],
      default: "ABSENT",
    },
    late: {
      type: Boolean,
      default: false,
    },
    leaveStatus: {
      type: String,
      enum: ["", "PENDING", "APPROVED", "REJECTED"],
      default: "",
    },
  },
  { timestamps: true }
);

teacherAttendanceSchema.plugin(mongoosePaginate);
teacherAttendanceSchema.plugin(aggregatePaginate);
teacherAttendanceSchema.index({ teacher: 1, checkIn: 1 });
teacherAttendanceSchema.index({ teacher: 1 });
teacherAttendanceSchema.index({ checkIn: 1 });
module.exports = mongoose.model("teacherAttendance", teacherAttendanceSchema);
