const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate");
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");
const Schema = mongoose.Schema;

const holidaySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: false,
    },
    audience: {
      type: String,
      enum: ["STUDENT", "TEACHER", "BOTH"],
      default: "BOTH",
    },
    type: {
      type: String,
      enum: ["HOLIDAY", "EVENT"],
      default: "HOLIDAY",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
    },
    createdByRole: {
      type: String,
      enum: ["admin", "teacher"],
    },
  },
  { timestamps: true }
);

holidaySchema.plugin(mongoosePaginate);
holidaySchema.plugin(aggregatePaginate);
module.exports = mongoose.model("holiday", holidaySchema);
