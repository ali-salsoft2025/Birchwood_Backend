const Fees = require("../Models/Fees");

const SCHOOL_CODE = "FEE";
const SEQUENCE_LENGTH = 5;

function billingPeriod(month, year) {
  const mm = String(Number(month)).padStart(2, "0");
  const yyyy = String(Number(year));
  return { mm, yyyy, yyyymm: `${yyyy}${mm}` };
}

function receiptPrefix() {
  return SCHOOL_CODE;
}

function extractSequence(receiptNo) {
  if (!receiptNo) return null;
  const value = String(receiptNo).trim().toUpperCase();

  const compact = value.match(/^FEE(\d+)$/);
  if (compact) return parseInt(compact[1], 10);

  const current = value.match(/^BW-FEE-\d{6}-(\d+)$/);
  if (current) return parseInt(current[1], 10);

  const legacy = value.match(/^BW-\d{4}-\d{2}-(\d+)$/);
  if (legacy) return parseInt(legacy[1], 10);

  const trailing = value.match(/(\d+)$/);
  if (trailing) return parseInt(trailing[1], 10);

  return null;
}

async function generateFeeReceiptNo() {
  const candidates = await Fees.find({
    receiptNo: { $exists: true, $ne: "" },
  })
    .select("receiptNo")
    .lean();

  let sequence = 0;
  for (const item of candidates) {
    const parsed = extractSequence(item.receiptNo);
    if (parsed && parsed > sequence) sequence = parsed;
  }

  return `${receiptPrefix()}${String(sequence + 1).padStart(SEQUENCE_LENGTH, "0")}`;
}

module.exports = {
  SCHOOL_CODE,
  SEQUENCE_LENGTH,
  receiptPrefix,
  generateFeeReceiptNo,
  extractSequence,
};
