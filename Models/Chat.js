const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate");
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");
const Schema = mongoose.Schema;

const chatSchema = new Schema(
  {
    isGroupChat: {
      type: Boolean,
      default: false,
    },
    unreadMessage: {
      type: Number,
      default: 0,
    },
    parentUnread: {
      type: Number,
      default: 0,
    },
    teacherUnread: {
      type: Number,
      default: 0,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "teacher",
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "parent",
    },
     children: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "children",
    },
    latestMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "message",
    },
    hiddenFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
      },
    ],
    clearedFor: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
        },
        at: {
          type: Date,
        },
      },
    ],
    status:{
        type:String,
        enum:["ACTIVE","INACTIVE"],
        default:"ACTIVE"
    }
  },
  { timestamps: true }
);

chatSchema.plugin(mongoosePaginate);
chatSchema.plugin(aggregatePaginate);
module.exports = mongoose.model("chat", chatSchema);
