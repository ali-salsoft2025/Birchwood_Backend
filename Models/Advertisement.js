const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate");
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");
const Schema = mongoose.Schema;

const advertisementSchema = new Schema(
  {
    title: {
      type: String,
      default: "",
    },
    image: {
      type: String,
      default: "",
    },
    link: {
      type: String,
      default: "",
    },
    order: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
  },
  { timestamps: true }
);

advertisementSchema.plugin(mongoosePaginate);
advertisementSchema.plugin(aggregatePaginate);

module.exports = mongoose.model("advertisement", advertisementSchema);
