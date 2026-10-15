/**
 * End-to-end fee voucher flow against a running API.
 * Run: API_BASE=http://127.0.0.1:3032/api node scripts/test-fee-flow.js
 *
 * Uses one existing student, then restores their fee and the school fee policy.
 */
require("../config/loadEnv");
const fs = require("fs");
const path = require("path");
const { connectDB } = require("../config/db");
const Children = require("../Models/Children");
const Parent = require("../Models/Parent");
const Admin = require("../Models/Admin");
const Fees = require("../Models/Fees");
const SchoolSettings = require("../Models/SchoolSettings");
const Notification = require("../Models/Notification");
const { generateToken, generateAdminToken } = require("../Helpers");

const BASE = process.env.API_BASE || "http://127.0.0.1:3032/api";
const startedAt = new Date();
const failures = [];
const createdFeeIds = [];

function pass(name) {
  console.log(`[PASS] ${name}`);
}

function fail(name, detail) {
  failures.push(name);
  console.log(`[FAIL] ${name}${detail ? " — " + detail : ""}`);
}

function assert(name, condition, detail) {
  if (condition) pass(name);
  else fail(name, detail);
}

async function req(method, urlPath, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers, body: payload });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function futureDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(12, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function pastDate(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
}

function pngForm(note, reference) {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "proof.png");
  form.append("note", note);
  form.append("reference", reference);
  return form;
}

async function main() {
  await connectDB();
  const admin = await Admin.findOne({ status: "ACTIVE" }).lean();
  const child = await Children.findOne({ status: "ACTIVE", parent: { $ne: null } }).lean();
  const parent = child ? await Parent.findById(child.parent).lean() : null;
  if (!admin || !child || !parent) {
    fail("fixtures", "Need an active admin and a student linked to a parent");
    return;
  }

  const adminToken = generateAdminToken(admin);
  const parentToken = generateToken(parent);
  const settings = await SchoolSettings.getSingleton();
  const originalPolicy = settings.feePolicy ? JSON.parse(JSON.stringify(settings.feePolicy)) : null;
  const originalFee = child.fee ? JSON.parse(JSON.stringify(child.fee)) : null;
  const month = 6;
  const year = 2027;
  const otherMonth = 7;

  try {
    const noAuth = await req("POST", "/fees/previewMonth", { body: { month, year } });
    assert("preview requires admin", noAuth.status === 403, `status ${noAuth.status}`);

    const parentBlocked = await req("POST", "/fees/sendMonth", {
      token: parentToken,
      body: { month, year, dueDate: futureDate(30) },
    });
    assert("parent cannot send vouchers", parentBlocked.status === 401, `status ${parentBlocked.status}`);

    const policyBody = {
      dueDayOfMonth: 10,
      graceDays: 0,
      lateFeeMode: "FLAT",
      lateFeeAmount: 500,
      lateFeeCap: 0,
      reminderDaysBeforeDue: 3,
      paymentInstructions: {
        accountTitle: "Fee Flow Test",
        method: "Bank transfer",
        accountNumber: "TEST-000",
        note: "Upload the receipt in the app.",
      },
    };
    const savedPolicy = await req("POST", "/settings/updateFeePolicy", { token: adminToken, body: policyBody });
    assert(
      "admin saves fee policy",
      savedPolicy.json?.status && savedPolicy.json.data?.feePolicy?.lateFeeMode === "FLAT",
      savedPolicy.json?.message
    );

    const parentPolicy = await req("GET", "/settings/getFeePolicy", { token: parentToken });
    assert(
      "parent can read payment instructions",
      parentPolicy.json?.data?.feePolicy?.paymentInstructions?.accountNumber === "TEST-000",
      parentPolicy.json?.message
    );

    const off = await req("POST", `/admin/children/updateChild/${child._id}`, {
      token: adminToken,
      body: { monthlyAmount: 8000, discountAmount: 500, feeActive: "false" },
    });
    assert("child fee can be turned off", off.json?.status && off.json.data?.child?.fee?.active === false, off.json?.message);

    const skippedOff = await req("POST", "/fees/previewMonth", {
      token: adminToken,
      body: { month, year, childIds: [String(child._id)] },
    });
    assert(
      "inactive fee is skipped",
      skippedOff.json?.data?.skipped?.[0]?.reason === "Fees are turned off for this student",
      JSON.stringify(skippedOff.json?.data?.skipped?.[0] || skippedOff.json)
    );

    await req("POST", `/admin/children/updateChild/${child._id}`, {
      token: adminToken,
      body: { monthlyAmount: 0, discountAmount: 0, feeActive: "true" },
    });
    const skippedZero = await req("POST", "/fees/previewMonth", {
      token: adminToken,
      body: { month, year, childIds: [String(child._id)] },
    });
    assert(
      "zero fee is skipped",
      skippedZero.json?.data?.skipped?.[0]?.reason === "No monthly fee set",
      skippedZero.json?.data?.skipped?.[0]?.reason
    );

    const setFee = await req("POST", `/admin/children/updateChild/${child._id}`, {
      token: adminToken,
      body: { monthlyAmount: 8000, discountAmount: 500, feeActive: "true" },
    });
    assert(
      "monthly fee saved on student",
      setFee.json?.data?.child?.fee?.monthlyAmount === 8000 && setFee.json.data.child.fee.discountAmount === 500,
      setFee.json?.message
    );

    const preview = await req("POST", "/fees/previewMonth", {
      token: adminToken,
      body: { month, year, childIds: [String(child._id)] },
    });
    assert(
      "preview includes net fee",
      preview.json?.data?.included?.[0]?.netAmount === 7500,
      JSON.stringify(preview.json?.data?.included?.[0] || preview.json)
    );

    const due = futureDate(40);
    const sent = await req("POST", "/fees/sendMonth", {
      token: adminToken,
      body: { month, year, dueDate: due, issuedAt: new Date().toISOString().slice(0, 10), childIds: [String(child._id)] },
    });
    const voucher = sent.json?.data?.vouchers?.[0];
    if (voucher?._id) createdFeeIds.push(voucher._id);
    assert("month voucher sent once", sent.json?.data?.sent === 1 && voucher?.totalAmount === 7500, sent.json?.message);
    assert("voucher has receipt and send date", Boolean(voucher?.receiptNo && voucher?.issuedAt), voucher?.receiptNo);

    const again = await req("POST", "/fees/sendMonth", {
      token: adminToken,
      body: { month, year, dueDate: due, childIds: [String(child._id)] },
    });
    assert(
      "same month is not sent twice",
      again.json?.status === false && again.json?.data?.skipped?.[0]?.reason === "Already sent for this month",
      again.json?.message || again.json?.data?.skipped?.[0]?.reason
    );

    const parentList = await req("GET", `/fees/getAllChildVouchers/${child._id}?limit=50`, { token: parentToken });
    const listed = (parentList.json?.data?.docs || []).find((row) => String(row._id) === String(voucher?._id));
    assert(
      "parent sees voucher and instructions",
      listed?.totalAmount === 7500 && listed?.paymentInstructions?.accountTitle === "Fee Flow Test",
      listed ? `total ${listed.totalAmount}` : parentList.json?.message
    );

    const detail = await req("GET", `/fees/getVoucherById/${voucher._id}`, { token: parentToken });
    assert(
      "parent voucher detail is a challan",
      detail.json?.data?.fee?.baseAmount === 8000 && detail.json.data.fee.discountAmount === 500,
      detail.json?.message
    );

    const otherParent = await Parent.findOne({ _id: { $ne: parent._id }, status: "ACTIVE" }).lean();
    if (otherParent) {
      const denied = await req("GET", `/fees/getVoucherById/${voucher._id}`, { token: generateToken(otherParent) });
      assert("another parent cannot open the voucher", denied.status === 403, `status ${denied.status}`);
    } else {
      pass("another parent cannot open the voucher (no second parent, skipped)");
    }

    const proof = await req("POST", `/fees/submitProof/${voucher._id}`, {
      token: parentToken,
      form: pngForm("Paid at the counter", "TXN-100"),
    });
    assert(
      "parent uploads payment proof",
      proof.json?.data?.fee?.displayStatus === "PROOF_SUBMITTED" && proof.json.data.fee.proof?.reference === "TXN-100",
      proof.json?.message
    );

    const adminList = await req("GET", "/fees/getAllVouchers?status=PROOF_SUBMITTED&limit=50", { token: adminToken });
    const waiting = (adminList.json?.data?.docs || []).some((row) => String(row._id) === String(voucher._id));
    assert(
      "admin queue shows the proof",
      waiting && adminList.json?.data?.proofWaiting >= 1,
      `waiting ${waiting} count ${adminList.json?.data?.proofWaiting}`
    );

    const adminNotice = await Notification.findOne({
      isAdmin: true,
      title: "Payment proof received",
      createdAt: { $gte: startedAt },
    }).lean();
    assert("admin gets a live notice", Boolean(adminNotice), "notification missing");

    const badReject = await req("POST", `/fees/review/${voucher._id}`, {
      token: adminToken,
      body: { action: "REJECTED", rejectReason: "  " },
    });
    assert("reject needs a reason", badReject.json?.status === false, badReject.json?.message);

    const rejected = await req("POST", `/fees/review/${voucher._id}`, {
      token: adminToken,
      body: { action: "REJECTED", rejectReason: "Amount does not match" },
    });
    assert("admin sends proof back", rejected.json?.status && rejected.json.data?.displayStatus === "REJECTED", rejected.json?.message);

    const parentNotice = await Notification.findOne({
      assignee: parent._id,
      title: "Payment proof not accepted",
      createdAt: { $gte: startedAt },
    }).lean();
    assert("parent is told the proof was rejected", Boolean(parentNotice?.content?.includes("Amount does not match")));

    const againProof = await req("POST", `/fees/submitProof/${voucher._id}`, {
      token: parentToken,
      form: pngForm("Corrected slip", "TXN-200"),
    });
    assert(
      "parent can upload again after rejection",
      againProof.json?.data?.fee?.displayStatus === "PROOF_SUBMITTED" && againProof.json.data.fee.proof?.reference === "TXN-200",
      againProof.json?.message
    );

    const paid = await req("POST", `/fees/review/${voucher._id}`, {
      token: adminToken,
      body: { action: "PAID" },
    });
    assert(
      "admin marks the voucher paid and freezes the receipt",
      paid.json?.data?.status === "PAID" && paid.json.data.isPaid === true && paid.json.data.lateFeeAmount === 0 && paid.json.data.totalAmount === 7500,
      `${paid.json?.message} late ${paid.json?.data?.lateFeeAmount}`
    );

    const paidNotice = await Notification.findOne({
      assignee: parent._id,
      title: "Fee marked paid",
      createdAt: { $gte: startedAt },
    }).lean();
    assert("parent is told the fee is paid", Boolean(paidNotice));

    const editPaid = await req("POST", `/fees/updateVoucher/${voucher._id}`, {
      token: adminToken,
      body: { amount: 1 },
    });
    assert("paid voucher cannot be edited", editPaid.json?.status === false, editPaid.json?.message);

    const deletePaid = await req("GET", `/fees/deleteVoucher/${voucher._id}`, { token: adminToken });
    assert("paid voucher stays on record", deletePaid.json?.status === false, deletePaid.json?.message);

    const overdueDue = pastDate(3);
    const created = await req("POST", "/fees/createVoucher", {
      token: adminToken,
      body: {
        children: String(child._id),
        month: otherMonth,
        year,
        amount: 8000,
        discountAmount: 500,
        dueDate: futureDate(20),
      },
    });
    const second = created.json?.data?.fee;
    if (second?._id) createdFeeIds.push(second._id);
    assert("single voucher uses the fee and blocks a duplicate month later", created.json?.status && second?.netAmount === 7500, created.json?.message);

    const duplicate = await req("POST", "/fees/createVoucher", {
      token: adminToken,
      body: { children: String(child._id), month: otherMonth, year, amount: 1000, dueDate: futureDate(20) },
    });
    assert("second voucher for that month is blocked", duplicate.json?.status === false, duplicate.json?.message);

    const backdated = await req("POST", `/fees/updateVoucher/${second._id}`, {
      token: adminToken,
      body: { dueDate: overdueDue },
    });
    assert(
      "overdue voucher adds the flat late fee",
      backdated.json?.data?.displayStatus === "OVERDUE" && backdated.json.data.lateFeeAmount === 500 && backdated.json.data.totalAmount === 8000,
      `status ${backdated.json?.data?.displayStatus} late ${backdated.json?.data?.lateFeeAmount} total ${backdated.json?.data?.totalAmount} ${backdated.json?.message}`
    );

    const cancelled = await req("POST", `/fees/review/${second._id}`, {
      token: adminToken,
      body: { action: "CANCELLED" },
    });
    assert("unpaid voucher can be cancelled", cancelled.json?.data?.status === "CANCELLED", cancelled.json?.message);

    const resent = await req("POST", "/fees/sendMonth", {
      token: adminToken,
      body: { month: otherMonth, year, dueDate: futureDate(25), childIds: [String(child._id)] },
    });
    const third = resent.json?.data?.vouchers?.[0];
    if (third?._id) createdFeeIds.push(third._id);
    assert("cancelled month can be sent again", resent.json?.data?.sent === 1, resent.json?.message);

    const waived = await req("POST", `/fees/review/${third._id}`, { token: adminToken, body: { action: "WAIVED" } });
    assert("admin can waive a voucher", waived.json?.data?.status === "WAIVED" && waived.json.data.isPaid === true, waived.json?.message);

    const hidden = await req("GET", `/fees/getAllChildVouchers/${child._id}?limit=50`, { token: parentToken });
    const showsCancelled = (hidden.json?.data?.docs || []).some((row) => row.status === "CANCELLED");
    assert("cancelled vouchers stay off the parent list", !showsCancelled);
  } finally {
    if (createdFeeIds.length) {
      const rows = await Fees.find({ _id: { $in: createdFeeIds } }).select("proof.file").lean();
      rows.forEach((row) => {
        if (!row.proof?.file) return;
        const filePath = path.join(__dirname, "..", "Uploads", row.proof.file);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      });
      await Fees.deleteMany({ _id: { $in: createdFeeIds } });
    }
    await Notification.deleteMany({
      createdAt: { $gte: startedAt },
      title: {
        $in: [
          "Fee voucher sent",
          "Fee vouchers sent",
          "Payment proof received",
          "Payment proof not accepted",
          "Fee marked paid",
          "Fee voucher cancelled",
          "Fee waived",
          "New voucher created",
        ],
      },
    });
    await Children.updateOne({ _id: child._id }, originalFee ? { $set: { fee: originalFee } } : { $unset: { fee: "" } });
    const doc = await SchoolSettings.getSingleton();
    doc.feePolicy = originalPolicy || undefined;
    doc.markModified("feePolicy");
    await doc.save();
    console.log("Restored student fee, fee policy, and removed test vouchers.");
  }
}

main()
  .then(() => {
    if (failures.length) {
      console.log(`\n${failures.length} check(s) failed`);
      process.exitCode = 1;
    } else {
      console.log("\nFee flow passed");
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const mongoose = require("mongoose");
    await mongoose.disconnect();
  });
