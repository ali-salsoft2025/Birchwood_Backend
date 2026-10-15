const mongoose = require("mongoose");
const { createHmac } = require("node:crypto");
const mongoosePaginate = require("mongoose-paginate");
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");
const Schema = mongoose.Schema;
const crypto = require("crypto");
const { token } = require("morgan");
const { v4: uuidv4 } = require("uuid");
const { generateRandom6DigitID } = require("../Helpers");

const feeSchema = new Schema(
  {
    receiptNo: {
      type: String,
      unique: false,
    },
    children: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "children",
    },
    amount: {
      type: Number,
      default: 0,
    },
    month: {
      type: Number,
      required: true,
    },
    year: {
      type: Number,
      required: true,
    },
    dueDate: {
      type: Date,
    },
    issuedAt: {
      type: Date,
    },
    paymentDate: {
      type: Date,
    },
    isPaid: {
      type: Boolean,
      default: false,
    },
    baseAmount: {
      type: Number,
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
    lateFeeAmount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["ISSUED", "PROOF_SUBMITTED", "REJECTED", "PAID", "WAIVED", "CANCELLED"],
    },
    proof: {
      file: { type: String, default: "" },
      note: { type: String, default: "" },
      reference: { type: String, default: "" },
      submittedAt: { type: Date },
    },
    rejectReason: {
      type: String,
      default: "",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "admin",
    },
    reviewedAt: {
      type: Date,
    },
    reminderSentAt: {
      type: Date,
    },
    overdueNotifiedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

feeSchema.index(
  { children: 1, month: 1, year: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["ISSUED", "PROOF_SUBMITTED", "REJECTED", "PAID", "WAIVED"] },
    },
  }
);

feeSchema.plugin(mongoosePaginate);
feeSchema.plugin(aggregatePaginate);
module.exports = mongoose.model("fee", feeSchema);
