/**
 * Parent opens a numbered support ticket, chats, and admin can close it.
 * Run: node scripts/test-support-tickets.js
 */
require("../config/loadEnv");
const mongoose = require("mongoose");
const Admin = require("../Models/Admin");
const Parent = require("../Models/Parent");
const SupportTicket = require("../Models/SupportTicket");
const SupportMessage = require("../Models/SupportMessage");

const BASE = process.env.API_BASE || "http://localhost:3031/api";

function fail(message) {
  console.error("FAIL", message);
  process.exitCode = 1;
}

async function req(method, urlPath, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  if (!process.env.DB) {
    throw new Error("DB is not set");
  }
  await mongoose.connect(process.env.DB);

  const unique = Date.now();
  const parentEmail = `support.parent.${unique}@birchwood.test`;
  const adminEmail = `support.admin.${unique}@birchwood.test`;
  const password = "Support@Test99";
  let parentId = null;
  let adminId = null;
  let ticketId = null;

  try {
    const signup = await req("POST", "/auth/signup", {
      fatherFirstName: "Support",
      fatherLastName: "Parent",
      motherFirstName: "Support",
      motherLastName: "Parent",
      email: parentEmail,
      phone: "5550003333",
      password,
    });
    if (signup.json.status !== true) {
      fail(`parent signup failed: ${signup.json.message}`);
      return;
    }

    const parentSignin = await req("POST", "/auth/signin", {
      email: parentEmail,
      password,
    });
    const parentToken = parentSignin.json.data?.token;
    parentId = parentSignin.json.data?.user?._id || parentSignin.json.data?.parent?._id;
    if (!parentToken) {
      fail("parent signin failed");
      return;
    }

    const admin = new Admin({
      firstName: "Support",
      lastName: "Desk",
      email: adminEmail,
      password,
      status: "ACTIVE",
    });
    await admin.save();
    adminId = admin._id;

    const adminSignin = await req("POST", "/admin/auth/signin", {
      email: adminEmail,
      password,
    });
    const adminToken = adminSignin.json.data?.token;
    if (!adminToken) {
      fail(`admin signin failed: ${adminSignin.status} ${adminSignin.json.message}`);
      return;
    }

    const created = await req(
      "POST",
      "/support/createTicket",
      {
        subject: "Fee receipt missing",
        message: "Please resend the March receipt.",
        category: "FEES",
      },
      parentToken,
    );
    const ticket = created.json.data?.ticket;
    ticketId = ticket?._id;
    if (created.json.status !== true || !ticket?.ticketNumber) {
      fail(`create failed: ${created.json.message}`);
      return;
    }
    if (!/^BW-TKT-\d{6}$/.test(ticket.ticketNumber)) {
      fail(`bad ticket number ${ticket.ticketNumber}`);
    } else {
      console.log("PASS parent opened", ticket.ticketNumber);
    }

    const list = await req("GET", "/support/getAllTickets?page=1&limit=20", null, parentToken);
    const docs = list.json.data?.docs || [];
    if (!docs.some((item) => String(item._id) === String(ticketId))) {
      fail("ticket missing from parent list");
    } else {
      console.log("PASS ticket listed for parent");
    }

    const parentReply = await req(
      "POST",
      `/support/sendMessage/${ticketId}`,
      { body: "It was for March." },
      parentToken,
    );
    if (parentReply.json.status !== true) {
      fail(`parent reply failed: ${parentReply.json.message}`);
    } else {
      console.log("PASS parent message");
    }

    const adminReply = await req(
      "POST",
      `/support/sendMessage/${ticketId}`,
      { body: "We will resend it today." },
      adminToken,
    );
    if (adminReply.json.status !== true || adminReply.json.data?.message?.senderRole !== "ADMIN") {
      fail(`admin reply failed: ${adminReply.json.message}`);
    } else {
      console.log("PASS admin realtime message saved");
    }

    const thread = await req(
      "GET",
      `/support/getTicketMessages/${ticketId}?page=1&limit=20`,
      null,
      parentToken,
    );
    const bodies = (thread.json.data?.docs || []).map((item) => item.body);
    if (
      !bodies.includes("Please resend the March receipt.") ||
      !bodies.includes("We will resend it today.")
    ) {
      fail(`thread missing messages ${JSON.stringify(bodies)}`);
    } else {
      console.log("PASS chat thread includes both sides");
    }

    const closed = await req(
      "POST",
      `/support/updateTicket/${ticketId}`,
      { status: "CLOSED" },
      adminToken,
    );
    if (closed.json.status !== true || closed.json.data?.ticket?.status !== "CLOSED") {
      fail(`close failed: ${closed.json.message}`);
    } else {
      console.log("PASS admin closed ticket");
    }

    const blocked = await req(
      "POST",
      `/support/sendMessage/${ticketId}`,
      { body: "One more thing" },
      parentToken,
    );
    if (blocked.json.status !== false) {
      fail("closed ticket still accepted a message");
    } else {
      console.log("PASS closed ticket rejects new messages");
    }
  } finally {
    if (ticketId) {
      await SupportMessage.deleteMany({ ticket: ticketId });
      await SupportTicket.findByIdAndDelete(ticketId);
    }
    if (parentId) await Parent.findByIdAndDelete(parentId);
    if (adminId) await Admin.findByIdAndDelete(adminId);
    await Parent.deleteOne({ email: parentEmail });
    await Admin.deleteOne({ email: adminEmail });
    await mongoose.disconnect();
  }

  if (process.exitCode === 1) process.exit(1);
  console.log("Support ticket flow passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
