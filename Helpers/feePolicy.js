const moment = require("moment");
const SchoolSettings = require("../Models/SchoolSettings");
const Fees = require("../Models/Fees");
const { sendNotificationToUser } = require("./notification");

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DEFAULT_FEE_POLICY = {
  dueDayOfMonth: 10,
  graceDays: 0,
  lateFeeMode: "NONE",
  lateFeeAmount: 0,
  lateFeeCap: 0,
  reminderDaysBeforeDue: 3,
  paymentInstructions: {
    accountTitle: "",
    method: "",
    accountNumber: "",
    note: "",
  },
};

const CLOSED_STATUSES = ["PAID", "WAIVED", "CANCELLED"];

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeFeePolicy(raw = {}) {
  const source = raw.feePolicy || raw || {};
  const instructions = source.paymentInstructions || {};
  const mode = ["NONE", "FLAT", "PER_DAY"].includes(source.lateFeeMode) ? source.lateFeeMode : "NONE";
  return {
    dueDayOfMonth: clampInt(source.dueDayOfMonth, 1, 28, DEFAULT_FEE_POLICY.dueDayOfMonth),
    graceDays: clampInt(source.graceDays, 0, 60, DEFAULT_FEE_POLICY.graceDays),
    lateFeeMode: mode,
    lateFeeAmount: Math.max(0, Number(source.lateFeeAmount) || 0),
    lateFeeCap: Math.max(0, Number(source.lateFeeCap) || 0),
    reminderDaysBeforeDue: clampInt(source.reminderDaysBeforeDue, 0, 28, DEFAULT_FEE_POLICY.reminderDaysBeforeDue),
    paymentInstructions: {
      accountTitle: String(instructions.accountTitle || "").trim().slice(0, 120),
      method: String(instructions.method || "").trim().slice(0, 80),
      accountNumber: String(instructions.accountNumber || "").trim().slice(0, 80),
      note: String(instructions.note || "").trim().slice(0, 500),
    },
  };
}

async function loadFeePolicy() {
  const doc = await SchoolSettings.getSingleton();
  return normalizeFeePolicy(doc.feePolicy || {});
}

function resolveStatus(fee) {
  if (fee?.status) return fee.status;
  return fee?.isPaid ? "PAID" : "ISSUED";
}

function netBase(fee) {
  const hasBase = fee?.baseAmount !== undefined && fee?.baseAmount !== null;
  const base = hasBase ? Number(fee.baseAmount) || 0 : Number(fee?.amount) || 0;
  const discount = Math.max(0, Number(fee?.discountAmount) || 0);
  return {
    baseAmount: base,
    discountAmount: Math.min(base, discount),
    netAmount: Math.max(0, base - discount),
  };
}

function calculateLiveLateFee(dueDate, policy, asOf = new Date()) {
  const mode = policy?.lateFeeMode || "NONE";
  const rate = Number(policy?.lateFeeAmount) || 0;
  if (mode === "NONE" || rate <= 0 || !dueDate) return 0;
  const grace = Math.max(0, Number(policy?.graceDays) || 0);
  const deadline = moment(dueDate).startOf("day").add(grace, "days");
  const today = moment(asOf).startOf("day");
  if (!today.isAfter(deadline)) return 0;
  let amount = mode === "PER_DAY" ? rate * today.diff(deadline, "days") : rate;
  const cap = Number(policy?.lateFeeCap) || 0;
  if (cap > 0) amount = Math.min(amount, cap);
  return Math.max(0, Math.round(amount));
}

function isOverdue(fee, policy, asOf = new Date()) {
  const status = resolveStatus(fee);
  if (!["ISSUED", "PROOF_SUBMITTED", "REJECTED"].includes(status)) return false;
  if (!fee?.dueDate) return false;
  const grace = Math.max(0, Number(policy?.graceDays) || 0);
  const deadline = moment(fee.dueDate).startOf("day").add(grace, "days");
  return moment(asOf).startOf("day").isAfter(deadline);
}

function presentVoucher(fee, policy, asOf = new Date()) {
  const plain = fee && typeof fee.toObject === "function" ? fee.toObject() : { ...(fee || {}) };
  const status = resolveStatus(plain);
  const parts = netBase(plain);
  const closed = status === "PAID" || status === "WAIVED";
  const lateFeeAmount = closed
    ? Number(plain.lateFeeAmount) || 0
    : status === "CANCELLED"
      ? 0
      : calculateLiveLateFee(plain.dueDate, policy, asOf);
  const overdue = isOverdue({ ...plain, status }, policy, asOf);
  return {
    ...plain,
    status,
    baseAmount: parts.baseAmount,
    discountAmount: parts.discountAmount,
    netAmount: parts.netAmount,
    lateFeeAmount,
    totalAmount: status === "CANCELLED" ? 0 : parts.netAmount + lateFeeAmount,
    overdue,
    displayStatus: status === "ISSUED" && overdue ? "OVERDUE" : status,
    isPaid: status === "PAID" || status === "WAIVED",
    paymentInstructions: policy?.paymentInstructions || DEFAULT_FEE_POLICY.paymentInstructions,
  };
}

function periodLabel(month, year) {
  const name = MONTHS[Number(month) - 1] || "Fee";
  return year ? `${name} ${year}` : name;
}

function childLabel(child) {
  if (!child || typeof child !== "object") return "Student";
  return `${child.firstName || ""} ${child.lastName || ""}`.trim() || "Student";
}

function parentIdOf(child) {
  if (!child || typeof child !== "object") return null;
  return child.parent?._id || child.parent || null;
}

function money(amount) {
  const value = Number(amount) || 0;
  return `PKR ${value.toLocaleString("en-PK")}`;
}

function dueCutoff(policy, asOf = new Date()) {
  const grace = Math.max(0, Number(policy?.graceDays) || 0);
  return moment(asOf).startOf("day").subtract(grace, "days").toDate();
}

function childFeeSnapshot(child) {
  const monthly = Math.max(0, Number(child?.fee?.monthlyAmount) || 0);
  const discount = Math.min(monthly, Math.max(0, Number(child?.fee?.discountAmount) || 0));
  return {
    monthlyAmount: monthly,
    discountAmount: discount,
    active: child?.fee?.active !== false,
    netAmount: Math.max(0, monthly - discount),
  };
}

async function notifyParent(child, title, content) {
  const parentId = parentIdOf(child);
  if (!parentId) return null;
  return sendNotificationToUser(parentId, title, content, "NOTIFICATION", {
    recipientRole: "PARENT",
  });
}

async function runFeeReminders(asOf = new Date()) {
  const policy = await loadFeePolicy();
  const today = moment(asOf).startOf("day");
  const vouchers = await Fees.find({
    $or: [
      { status: { $in: ["ISSUED", "REJECTED"] } },
      { status: { $exists: false }, isPaid: { $ne: true } },
      { status: null, isPaid: { $ne: true } },
    ],
  }).populate("children", "firstName lastName parent");

  let reminders = 0;
  let overdueNotices = 0;

  for (const fee of vouchers) {
    const child = fee.children;
    if (!parentIdOf(child) || !fee.dueDate) continue;
    const presented = presentVoucher(fee, policy, asOf);
    const due = moment(fee.dueDate).startOf("day");
    const reminderDays = Number(policy.reminderDaysBeforeDue) || 0;
    let changed = false;

    if (reminderDays > 0 && !fee.reminderSentAt) {
      const windowStart = due.clone().subtract(reminderDays, "days");
      if (today.isSameOrAfter(windowStart) && today.isSameOrBefore(due)) {
        await notifyParent(
          child,
          "Fee due soon",
          `${childLabel(child)}'s ${periodLabel(fee.month, fee.year)} fee of ${money(presented.totalAmount)} is due on ${due.format("MMMM D, YYYY")}.`
        );
        fee.reminderSentAt = new Date();
        changed = true;
        reminders += 1;
      }
    }

    if (!fee.overdueNotifiedAt && presented.overdue && ["OVERDUE", "REJECTED"].includes(presented.displayStatus)) {
      await notifyParent(
        child,
        "Fee overdue",
        `${childLabel(child)}'s ${periodLabel(fee.month, fee.year)} fee is overdue. Please pay ${money(presented.totalAmount)} and upload the receipt in the app.`
      );
      fee.overdueNotifiedAt = new Date();
      changed = true;
      overdueNotices += 1;
    }

    if (changed) await fee.save();
  }

  return { reminders, overdueNotices };
}

module.exports = {
  MONTHS,
  DEFAULT_FEE_POLICY,
  CLOSED_STATUSES,
  normalizeFeePolicy,
  loadFeePolicy,
  resolveStatus,
  netBase,
  calculateLiveLateFee,
  isOverdue,
  presentVoucher,
  periodLabel,
  childLabel,
  parentIdOf,
  money,
  dueCutoff,
  childFeeSnapshot,
  notifyParent,
  runFeeReminders,
};
