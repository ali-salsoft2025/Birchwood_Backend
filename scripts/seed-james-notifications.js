/**
 * Queue a few realtime school notices + inbox notifications for James William.
 * Uses the running API so delivery goes through the notification queue + sockets.
 *
 *   node scripts/seed-james-notifications.js
 */
require("../config/loadEnv");
const mongoose = require("mongoose");
const Parent = require("../Models/Parent");

const BASE = process.env.API_BASE || "http://localhost:3031/api";
const ADMIN_EMAIL =
  process.env.ADMIN_SEED_EMAIL || "admin@thebirchwoodacademy.com";
const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD || "Admin@Birchwood1";

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

const NOTICE_ITEMS = [
  {
    title: "Early pickup reminder",
    content:
      "Hi James — tomorrow school finishes at 12:30 for staff training. Please arrange early pickup.",
    type: "REMINDER",
  },
  {
    title: "Sports day next Friday",
    content:
      "Sports day is next Friday on the main field. Bring a water bottle and sun hat for your child.",
    type: "EVENT",
  },
  {
    title: "Term fee reminder",
    content:
      "A friendly reminder that the current term fee is due by Friday. You can pay in the Fees section of the app.",
    type: "ALERT",
  },
  {
    title: "Classroom reading week",
    content:
      "This week is Reading Week. Please encourage 15 minutes of reading at home each evening.",
    type: "GENERAL",
  },
];

const INBOX_ITEMS = [
  {
    title: "New message from school",
    content: "Your support ticket about fees has a new reply from the office.",
    type: "NOTIFICATION",
  },
  {
    title: "Attendance update",
    content: "Your child’s check-in was recorded successfully this morning.",
    type: "NOTIFICATION",
  },
];

async function main() {
  if (!process.env.DB) {
    throw new Error("DB is not set in .env");
  }

  await mongoose.connect(process.env.DB);

  const parent = await Parent.findOne({
    $or: [
      { email: "james.william@birchwood.local" },
      { fatherFirstName: "James", fatherLastName: "William" },
      { fatherFirstName: "James", fatherLastName: "Williams" },
      { fatherFirstName: "William", fatherLastName: "James" },
    ],
  }).lean();

  if (!parent?._id) {
    throw new Error("Could not find parent James William / James Williams.");
  }

  const parentId = String(parent._id);
  console.log(
    `Found parent ${parent.fatherFirstName || ""} ${parent.fatherLastName || ""} <${parent.email}> (${parentId})`,
  );

  const adminSignin = await req("POST", "/admin/auth/signin", {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  const adminToken = adminSignin.json?.data?.token;
  if (!adminToken) {
    throw new Error(
      `Admin sign-in failed: ${adminSignin.status} ${adminSignin.json?.message || ""}`,
    );
  }

  for (const item of NOTICE_ITEMS) {
    const result = await req(
      "POST",
      "/notification/createAlertOrAnnoucement",
      {
        title: item.title,
        content: item.content,
        type: item.type,
        sendTo: "CUSTOM",
        teachers: [],
        parents: [parentId],
      },
      adminToken,
    );

    if (!result.json?.status) {
      console.error(`Failed notice "${item.title}":`, result.json?.message || result.status);
      continue;
    }
    console.log(`Queued notice: ${item.title}`);
  }

  for (const item of INBOX_ITEMS) {
    const result = await req(
      "POST",
      "/notification/sendUserNotification",
      {
        userId: parentId,
        title: item.title,
        content: item.content,
        type: item.type,
      },
      adminToken,
    );

    if (!result.json?.status) {
      console.error(
        `Failed inbox "${item.title}":`,
        result.json?.message || result.status,
        "(endpoint may be missing — notices above still queued)",
      );
      continue;
    }
    console.log(`Sent inbox: ${item.title}`);
  }

  await mongoose.disconnect();
  console.log("Done. Notices were queued on the live server for realtime delivery.");
}

main().catch(async (error) => {
  console.error("Failed:", error.message);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
