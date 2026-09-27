const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const gallerySchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    caption: {
      type: String,
      default: "",
    },
    images: [
      {
        type: String,
      },
    ],
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("gallery", gallerySchema);
