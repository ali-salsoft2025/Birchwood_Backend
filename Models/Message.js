const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate");
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");
const Schema = mongoose.Schema;

const messageSchema = new Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "senderType",
    },
    senderType: {
      type: String,
      enum: ["teacher", "parent"],
    },
    content: {
      type: String,
      trim: true,
    },
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "chat",
    },
  },
  { timestamps: true }
);

messageSchema.plugin(mongoosePaginate);
messageSchema.plugin(aggregatePaginate);
module.exports = mongoose.model("message", messageSchema);