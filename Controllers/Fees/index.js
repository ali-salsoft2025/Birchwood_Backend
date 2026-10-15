const fs = require("fs");
const moment = require("moment");
const mongoose = require("mongoose");
const Fees = require("../../Models/Fees");
const Children = require("../../Models/Children");
const SchoolSettings = require("../../Models/SchoolSettings");
const { ApiResponse } = require("../../Helpers/index");
const { errorHandler } = require("../../Helpers/errorHandler");
const { sendNotificationToAdmin } = require("../../Helpers/notification");
const { generateFeeReceiptNo } = require("../../Helpers/feeReceipt");
const { assertCanAccessChild } = require("../../Helpers/accessControl");
const { parseQueryList, parseObjectIdList, pushInMatch } = require("../../Helpers/queryList");
const {
  CLOSED_STATUSES,
  loadFeePolicy,
  resolveStatus,
  presentVoucher,
  calculateLiveLateFee,
  periodLabel,
  childLabel,
  money,
  dueCutoff,
  childFeeSnapshot,
  notifyParent,
} = require("../../Helpers/feePolicy");

function duplicateMessage(error) {
  return error && (error.code === 11000 || errorHandler(error)?.toLowerCase?.().includes("duplicate"));
}

function openVoucherFilter(childId, month, year, excludeId) {
  const filter = {
    children: childId,
    month: Number(month),
    year: Number(year),
    status: { $ne: "CANCELLED" },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return filter;
}

function statusClause(status, policy) {
  const key = String(status || "").toUpperCase();
  const cutoff = dueCutoff(policy);
  const issuedOpen = {
    $or: [
      { status: "ISSUED" },
      { status: { $exists: false }, isPaid: { $ne: true } },
      { status: null, isPaid: { $ne: true } },
    ],
  };
  if (key === "UNPAID" || key === "ISSUED") {
    return { $and: [issuedOpen, { $or: [{ dueDate: { $gte: cutoff } }, { dueDate: null }, { dueDate: { $exists: false } }] }] };
  }
  if (key === "OVERDUE") {
    return { $and: [issuedOpen, { dueDate: { $lt: cutoff } }] };
  }
  if (key === "PAID") {
    return {
      $or: [
        { status: "PAID" },
        { status: { $exists: false }, isPaid: true },
        { status: null, isPaid: true },
      ],
    };
  }
  if (["PROOF_SUBMITTED", "REJECTED", "WAIVED", "CANCELLED"].includes(key)) {
    return { status: key };
  }
  return null;
}

function amountsFromBody(body, child) {
  const snapshot = childFeeSnapshot(child);
  const hasAmount = body.amount !== undefined && body.amount !== null && String(body.amount) !== "";
  const hasDiscount = body.discountAmount !== undefined && body.discountAmount !== null && String(body.discountAmount) !== "";
  const base = hasAmount ? Math.max(0, Number(body.amount) || 0) : snapshot.monthlyAmount;
  let discount = hasDiscount ? Math.max(0, Number(body.discountAmount) || 0) : hasAmount ? 0 : snapshot.discountAmount;
  if (discount > base) discount = base;
  return { baseAmount: base, discountAmount: discount, netAmount: Math.max(0, base - discount) };
}

async function ensureFeesModule(req, res) {
  if (req.isAdmin) return true;
  const modules = await SchoolSettings.getModules();
  if (modules.fees === false) {
    res.status(403).json(ApiResponse({}, "This feature is turned off", false));
    return false;
  }
  return true;
}

async function loadOwnedVoucher(req, res) {
  const fee = await Fees.findById(req.params.id);
  if (!fee) {
    res.status(404).json(ApiResponse({}, "Voucher not found", false));
    return null;
  }
  if (!(await assertCanAccessChild(req, res, fee.children))) return null;
  return fee;
}

function canEdit(fee) {
  return !CLOSED_STATUSES.includes(resolveStatus(fee));
}

async function selectMonthCandidates({ month, year, classroom, childIds }) {
  const filter = { status: "ACTIVE" };
  if (classroom && mongoose.Types.ObjectId.isValid(classroom)) {
    filter.classroom = classroom;
  }
  const ids = (Array.isArray(childIds) ? childIds : [])
    .filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (ids.length) filter._id = { $in: ids };

  const children = await Children.find(filter)
    .select("firstName lastName rollNumber parent fee classroom")
    .sort({ firstName: 1, lastName: 1 });

  const existing = await Fees.find({
    month: Number(month),
    year: Number(year),
    children: { $in: children.map((child) => child._id) },
    status: { $ne: "CANCELLED" },
  }).select("children");
  const taken = new Set(existing.map((row) => String(row.children)));

  const included = [];
  const skipped = [];
  children.forEach((child) => {
    const snapshot = childFeeSnapshot(child);
    const row = {
      _id: child._id,
      name: childLabel(child),
      rollNumber: child.rollNumber || "",
      monthlyAmount: snapshot.monthlyAmount,
      discountAmount: snapshot.discountAmount,
      netAmount: snapshot.netAmount,
    };
    if (taken.has(String(child._id))) {
      skipped.push({ ...row, reason: "Already sent for this month" });
      return;
    }
    if (!snapshot.active) {
      skipped.push({ ...row, reason: "Fees are turned off for this student" });
      return;
    }
    if (snapshot.monthlyAmount <= 0) {
      skipped.push({ ...row, reason: "No monthly fee set" });
      return;
    }
    if (snapshot.netAmount <= 0) {
      skipped.push({ ...row, reason: "Nothing due after discount" });
      return;
    }
    included.push(row);
  });

  return { included, skipped, children };
}

exports.createVoucher = async (req, res) => {
  try {
    const { children, month, year, dueDate, issuedAt } = req.body;
    const child = await Children.findById(children).select("firstName lastName parent fee status");
    if (!child) {
      return res.json(ApiResponse({}, "Student not found", false));
    }
    const amounts = amountsFromBody(req.body, child);
    if (amounts.netAmount <= 0) {
      return res.json(ApiResponse({}, "Set a monthly fee for this student or enter an amount", false));
    }
    const existing = await Fees.findOne(openVoucherFilter(child._id, month, year));
    if (existing) {
      return res.json(ApiResponse({}, "A voucher already exists for this student and month", false));
    }

    const receiptNo = await generateFeeReceiptNo(month, year);
    const fee = new Fees({
      receiptNo,
      children: child._id,
      amount: amounts.netAmount,
      baseAmount: amounts.baseAmount,
      discountAmount: amounts.discountAmount,
      month: Number(month),
      year: Number(year),
      dueDate,
      issuedAt: issuedAt ? new Date(issuedAt) : new Date(),
      status: "ISSUED",
      isPaid: false,
      lateFeeAmount: 0,
    });
    await fee.save();

    const policy = await loadFeePolicy();
    const presented = presentVoucher(fee, policy);
    await notifyParent(
      child,
      "Fee voucher sent",
      `${childLabel(child)}'s ${periodLabel(month, year)} fee voucher is ready. Due ${moment(dueDate).format("MMMM D, YYYY")}. Amount ${money(presented.totalAmount)}.`
    );
    sendNotificationToAdmin(
      "New voucher created",
      `${childLabel(child)}'s ${periodLabel(month, year)} fee voucher was created.`
    );

    return res.status(200).json(ApiResponse({ fee: presented }, "Fee voucher created successfully", true));
  } catch (error) {
    const message = duplicateMessage(error)
      ? "A voucher already exists for this student and month"
      : errorHandler(error) || error.message;
    return res.json(ApiResponse({}, message, false));
  }
};

exports.previewMonth = async (req, res) => {
  try {
    const month = Number(req.body.month);
    const year = Number(req.body.year);
    if (!month || !year) {
      return res.status(400).json(ApiResponse({}, "Month and year are required", false));
    }
    const { included, skipped } = await selectMonthCandidates({
      month,
      year,
      classroom: req.body.classroom,
      childIds: req.body.childIds,
    });
    return res.json(ApiResponse({ included, skipped, month, year }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.sendMonth = async (req, res) => {
  try {
    const month = Number(req.body.month);
    const year = Number(req.body.year);
    const dueDate = req.body.dueDate;
    if (!month || !year || !dueDate) {
      return res.status(400).json(ApiResponse({}, "Month, year, and due date are required", false));
    }
    if (moment(dueDate).startOf("day").isSameOrBefore(moment().startOf("day"))) {
      return res.status(400).json(ApiResponse({}, "Due date must be after today", false));
    }

    const { included, skipped } = await selectMonthCandidates({
      month,
      year,
      classroom: req.body.classroom,
      childIds: req.body.childIds,
    });
    if (!included.length) {
      return res.json(ApiResponse({ sent: 0, skipped }, "No vouchers to send", false));
    }

    const issuedAt = req.body.issuedAt ? new Date(req.body.issuedAt) : new Date();
    const policy = await loadFeePolicy();
    const sent = [];

    for (const row of included) {
      const child = await Children.findById(row._id).select("firstName lastName parent fee");
      if (!child) {
        skipped.push({ ...row, reason: "Student not found" });
        continue;
      }
      try {
        const receiptNo = await generateFeeReceiptNo(month, year);
        const fee = await Fees.create({
          receiptNo,
          children: child._id,
          amount: row.netAmount,
          baseAmount: row.monthlyAmount,
          discountAmount: row.discountAmount,
          month,
          year,
          dueDate,
          issuedAt,
          status: "ISSUED",
          isPaid: false,
          lateFeeAmount: 0,
        });
        const presented = presentVoucher(fee, policy);
        await notifyParent(
          child,
          "Fee voucher sent",
          `${childLabel(child)}'s ${periodLabel(month, year)} fee voucher is ready. Due ${moment(dueDate).format("MMMM D, YYYY")}. Amount ${money(presented.totalAmount)}.`
        );
        sent.push(presented);
      } catch (error) {
        skipped.push({
          ...row,
          reason: duplicateMessage(error) ? "Already sent for this month" : error.message,
        });
      }
    }

    if (sent.length) {
      sendNotificationToAdmin(
        "Fee vouchers sent",
        `${sent.length} ${periodLabel(month, year)} fee voucher${sent.length === 1 ? "" : "s"} sent.`
      );
    }

    return res.json(
      ApiResponse(
        { sent: sent.length, skipped, vouchers: sent },
        sent.length ? "Fee vouchers sent" : "No vouchers to send",
        sent.length > 0
      )
    );
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getAllVouchers = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    const { keyword, children, from, to, status, month, year, classroom } = req.query;
    const policy = await loadFeePolicy();
    const finalAggregate = [{ $sort: { dueDate: 1, createdAt: -1 } }];

    if (children) {
      pushInMatch(finalAggregate, "children", parseObjectIdList(children));
    }
    if (month) finalAggregate.push({ $match: { month: Number(month) } });
    if (year) finalAggregate.push({ $match: { year: Number(year) } });

    const statuses = parseQueryList(status);
    const statusMatch = statuses.map((item) => statusClause(item, policy)).filter(Boolean);
    if (statusMatch.length === 1) finalAggregate.push({ $match: statusMatch[0] });
    if (statusMatch.length > 1) finalAggregate.push({ $match: { $or: statusMatch } });

    if (from) {
      finalAggregate.push({
        $match: { dueDate: { $gte: moment(from).startOf("day").toDate() } },
      });
    }
    if (to) {
      finalAggregate.push({
        $match: { dueDate: { $lte: moment(to).endOf("day").toDate() } },
      });
    }

    finalAggregate.push(
      {
        $lookup: {
          from: "childrens",
          localField: "children",
          foreignField: "_id",
          as: "child",
        },
      },
      { $unwind: { path: "$child", preserveNullAndEmptyArrays: true } }
    );

    if (keyword) {
      const regex = new RegExp(String(keyword).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      finalAggregate.push({
        $match: {
          $or: [
            { receiptNo: regex },
            { "child.firstName": regex },
            { "child.lastName": regex },
            { "child.rollNumber": regex },
          ],
        },
      });
    }

    if (classroom && mongoose.Types.ObjectId.isValid(classroom)) {
      finalAggregate.push({
        $match: { "child.classroom": new mongoose.Types.ObjectId(classroom) },
      });
    }

    const fees = await Fees.aggregatePaginate(Fees.aggregate(finalAggregate), { page, limit });
    fees.docs = (fees.docs || []).map((row) => presentVoucher(row, policy));
    fees.proofWaiting = await Fees.countDocuments({ status: "PROOF_SUBMITTED" });
    return res.json(ApiResponse(fees));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getAllChildVouchers = async (req, res) => {
  try {
    if (!(await ensureFeesModule(req, res))) return;
    if (!(await assertCanAccessChild(req, res, req.params.id))) return;

    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    const { from, to } = req.query;
    const policy = await loadFeePolicy();
    const finalAggregate = [
      {
        $match: {
          children: new mongoose.Types.ObjectId(req.params.id),
          status: { $ne: "CANCELLED" },
        },
      },
      { $sort: { year: -1, month: -1 } },
    ];

    if (from) {
      finalAggregate.push({
        $match: { dueDate: { $gte: moment(from).startOf("day").toDate() } },
      });
    }
    if (to) {
      finalAggregate.push({
        $match: { dueDate: { $lte: moment(to).endOf("day").toDate() } },
      });
    }

    const fees = await Fees.aggregatePaginate(Fees.aggregate(finalAggregate), { page, limit });
    fees.docs = (fees.docs || []).map((row) => presentVoucher(row, policy));
    fees.feePolicy = policy;
    res.set("Cache-Control", "no-store");
    return res.json(ApiResponse(fees));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getVoucherById = async (req, res) => {
  try {
    if (!(await ensureFeesModule(req, res))) return;
    const fee = await loadOwnedVoucher(req, res);
    if (!fee) return;
    const policy = await loadFeePolicy();
    const child = await Children.findById(fee.children)
      .select("firstName lastName rollNumber parent classroom fee image")
      .populate("classroom", "classroomName classroomId")
      .lean();
    return res.json(ApiResponse({ fee: { ...presentVoucher(fee, policy), child }, feePolicy: policy }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.updateVoucher = async (req, res) => {
  try {
    const fee = await Fees.findById(req.params.id);
    if (!fee) return res.json(ApiResponse({}, "No voucher found", false));
    if (!canEdit(fee)) {
      return res.json(ApiResponse({}, "This voucher can no longer be edited", false));
    }

    const month = req.body.month !== undefined ? Number(req.body.month) : fee.month;
    const year = req.body.year !== undefined ? Number(req.body.year) : fee.year;
    if (month !== fee.month || year !== fee.year) {
      const clash = await Fees.findOne(openVoucherFilter(fee.children, month, year, fee._id));
      if (clash) {
        return res.json(ApiResponse({}, "A voucher already exists for this student and month", false));
      }
      fee.month = month;
      fee.year = year;
    }

    if (req.body.dueDate) fee.dueDate = new Date(req.body.dueDate);
    if (req.body.issuedAt) fee.issuedAt = new Date(req.body.issuedAt);

    const touchesAmount = req.body.amount !== undefined || req.body.discountAmount !== undefined;
    if (touchesAmount) {
      const child = await Children.findById(fee.children).select("fee");
      const current = {
        amount: req.body.amount !== undefined ? req.body.amount : fee.baseAmount ?? fee.amount,
        discountAmount: req.body.discountAmount !== undefined ? req.body.discountAmount : fee.discountAmount,
      };
      const amounts = amountsFromBody(current, child);
      if (amounts.netAmount <= 0) {
        return res.json(ApiResponse({}, "Voucher amount must be greater than zero", false));
      }
      fee.baseAmount = amounts.baseAmount;
      fee.discountAmount = amounts.discountAmount;
      fee.amount = amounts.netAmount;
    }

    await fee.save();
    const policy = await loadFeePolicy();
    return res.json(ApiResponse(presentVoucher(fee, policy), "Voucher updated successfully", true));
  } catch (error) {
    const message = duplicateMessage(error)
      ? "A voucher already exists for this student and month"
      : error.message;
    return res.json(ApiResponse({}, message, false));
  }
};

exports.submitProof = async (req, res) => {
  try {
    if (!(await ensureFeesModule(req, res))) return;
    if (req.userRole !== "parent") {
      return res.status(403).json(ApiResponse({}, "Only a parent can upload payment proof", false));
    }
    const fee = await loadOwnedVoucher(req, res);
    if (!fee) return;
    const status = resolveStatus(fee);
    if (!["ISSUED", "REJECTED"].includes(status)) {
      return res.json(ApiResponse({}, "This voucher is not waiting for a payment receipt", false));
    }
    if (!req.file) {
      return res.status(400).json(ApiResponse({}, "Upload a photo or PDF of the payment", false));
    }

    if (fee.proof?.file) {
      const previous = `./Uploads/${fee.proof.file}`;
      if (fs.existsSync(previous)) fs.unlinkSync(previous);
    }

    fee.proof = {
      file: req.file.filename,
      note: String(req.body.note || "").trim().slice(0, 400),
      reference: String(req.body.reference || "").trim().slice(0, 80),
      submittedAt: new Date(),
    };
    fee.status = "PROOF_SUBMITTED";
    fee.rejectReason = "";
    fee.isPaid = false;
    await fee.save();

    const child = await Children.findById(fee.children).select("firstName lastName");
    sendNotificationToAdmin(
      "Payment proof received",
      `${childLabel(child)} uploaded payment proof for ${periodLabel(fee.month, fee.year)}. Review it in Fees.`
    );

    const policy = await loadFeePolicy();
    return res.json(ApiResponse({ fee: presentVoucher(fee, policy) }, "Payment proof sent to the school", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.reviewVoucher = async (req, res) => {
  try {
    const action = String(req.body.action || "").toUpperCase();
    const fee = await Fees.findById(req.params.id);
    if (!fee) return res.json(ApiResponse({}, "Voucher not found", false));
    const status = resolveStatus(fee);
    if (status === "CANCELLED") {
      return res.json(ApiResponse({}, "This voucher is cancelled", false));
    }

    const policy = await loadFeePolicy();
    const child = await Children.findById(fee.children).select("firstName lastName parent");
    const period = periodLabel(fee.month, fee.year);

    if (action === "PAID") {
      if (status === "WAIVED") {
        return res.json(ApiResponse({}, "This voucher was waived", false));
      }
      if (fee.baseAmount == null) fee.baseAmount = Number(fee.amount) || 0;
      fee.lateFeeAmount = calculateLiveLateFee(fee.dueDate, policy);
      fee.amount = Math.max(0, Number(fee.baseAmount) - (Number(fee.discountAmount) || 0));
      fee.status = "PAID";
      fee.isPaid = true;
      fee.paymentDate = req.body.paymentDate ? new Date(req.body.paymentDate) : new Date();
      fee.reviewedBy = req.user._id;
      fee.reviewedAt = new Date();
      fee.rejectReason = "";
      await fee.save();
      await notifyParent(
        child,
        "Fee marked paid",
        `${childLabel(child)}'s ${period} fee was marked paid. Receipt ${fee.receiptNo || ""}.`.trim()
      );
    } else if (action === "REJECTED") {
      const reason = String(req.body.rejectReason || "").trim().slice(0, 400);
      if (!reason) {
        return res.status(400).json(ApiResponse({}, "Add a reason for sending the proof back", false));
      }
      if (status !== "PROOF_SUBMITTED") {
        return res.json(ApiResponse({}, "There is no payment proof to reject", false));
      }
      fee.status = "REJECTED";
      fee.rejectReason = reason;
      fee.reviewedBy = req.user._id;
      fee.reviewedAt = new Date();
      fee.isPaid = false;
      await fee.save();
      await notifyParent(
        child,
        "Payment proof not accepted",
        `The payment proof for ${childLabel(child)}'s ${period} fee was not accepted. ${reason}`
      );
    } else if (action === "WAIVED") {
      if (fee.baseAmount == null) fee.baseAmount = Number(fee.amount) || 0;
      fee.status = "WAIVED";
      fee.isPaid = true;
      fee.lateFeeAmount = 0;
      fee.paymentDate = new Date();
      fee.reviewedBy = req.user._id;
      fee.reviewedAt = new Date();
      await fee.save();
      await notifyParent(child, "Fee waived", `${childLabel(child)}'s ${period} fee was waived.`);
    } else if (action === "CANCELLED") {
      if (status === "PAID" || status === "WAIVED") {
        return res.json(ApiResponse({}, "Paid vouchers stay on record", false));
      }
      fee.status = "CANCELLED";
      fee.isPaid = false;
      fee.reviewedBy = req.user._id;
      fee.reviewedAt = new Date();
      await fee.save();
      await notifyParent(child, "Fee voucher cancelled", `${childLabel(child)}'s ${period} fee voucher was cancelled.`);
    } else {
      return res.status(400).json(ApiResponse({}, "Unknown review action", false));
    }

    return res.json(ApiResponse(presentVoucher(fee, policy), "Voucher updated", true));
  } catch (error) {
    const message = duplicateMessage(error)
      ? "A voucher already exists for this student and month"
      : error.message;
    return res.json(ApiResponse({}, message, false));
  }
};

exports.toggleStatus = async (req, res) => {
  try {
    const fee = await Fees.findById(req.params.id);
    if (!fee) return res.json(ApiResponse({}, "Voucher not found", false));
    const status = resolveStatus(fee);
    if (status === "CANCELLED") {
      return res.json(ApiResponse({}, "This voucher is cancelled", false));
    }
    const policy = await loadFeePolicy();
    if (status === "PAID" || status === "WAIVED") {
      fee.status = "ISSUED";
      fee.isPaid = false;
      fee.paymentDate = undefined;
      fee.lateFeeAmount = 0;
    } else {
      if (fee.baseAmount == null) fee.baseAmount = Number(fee.amount) || 0;
      fee.lateFeeAmount = calculateLiveLateFee(fee.dueDate, policy);
      fee.amount = Math.max(0, Number(fee.baseAmount) - (Number(fee.discountAmount) || 0));
      fee.status = "PAID";
      fee.isPaid = true;
      fee.paymentDate = new Date();
      fee.reviewedBy = req.user._id;
      fee.reviewedAt = new Date();
    }
    await fee.save();
    return res.json(ApiResponse(presentVoucher(fee, policy), "Voucher status changed", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.deleteVoucher = async (req, res) => {
  try {
    const fee = await Fees.findById(req.params.id);
    if (!fee) return res.json(ApiResponse({}, "Voucher not found", false));
    const status = resolveStatus(fee);
    if (status === "PAID" || status === "WAIVED") {
      return res.json(ApiResponse({}, "Paid vouchers stay on record. Cancel an unpaid voucher instead.", false));
    }
    if (fee.proof?.file) {
      const filePath = `./Uploads/${fee.proof.file}`;
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await Fees.findByIdAndDelete(fee._id);
    return res.json(ApiResponse({}, "Voucher deleted successfully", true));
  } catch (error) {
    return res.json(ApiResponse({}, errorHandler(error) || error.message, false));
  }
};
