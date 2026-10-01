/**
 * Teacher and parent share one chat room, and a sent message arrives live.
 * Run: node scripts/test-chat-realtime.js
 */
require("../config/loadEnv");
const mongoose = require("mongoose");
const { io } = require("D:/Projects/birchwood-teacher/node_modules/socket.io-client");
const Children = require("../Models/Children");
const Classroom = require("../Models/Classroom");
const Teacher = require("../Models/Teacher");
const Parent = require("../Models/Parent");
const Chat = require("../Models/Chat");
const Message = require("../Models/Message");
const { generateToken } = require("../Helpers");

const BASE = process.env.API_BASE || "http://127.0.0.1:3031/api";
const ORIGIN = BASE.replace(/\/api\/?$/, "");

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

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(ORIGIN, {
      transports: ["websocket"],
      auth: { token: `Bearer ${token}` },
      timeout: 8000,
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("socket connect timed out"));
    }, 8000);
    socket.on("connected", (payload) => {
      clearTimeout(timer);
      resolve({ socket, payload });
    });
    socket.on("connect_error", (error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    });
  });
}

function joinChat(socket, chatId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("join chat timed out")), 8000);
    socket.emit("join chat", chatId, (ack) => {
      clearTimeout(timer);
      if (ack?.ok) resolve();
      else reject(new Error(ack?.message || "join chat failed"));
    });
  });
}

function waitForMessage(socket, text) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no live message: ${text}`)), 8000);
    const onMessage = (message) => {
      if (message?.content !== text) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(message);
    };
    socket.on("message", onMessage);
  });
}

async function main() {
  if (!process.env.DB) throw new Error("DB is not set");
  await mongoose.connect(process.env.DB);

  const child = await Children.findOne({
    parent: { $ne: null },
    classroom: { $ne: null },
  }).lean();
  if (!child) {
    fail("no child with a parent and classroom");
    return;
  }
  const classroom = await Classroom.findById(child.classroom).lean();
  const teacher = classroom?.teacher ? await Teacher.findById(classroom.teacher) : null;
  const parent = await Parent.findById(child.parent);
  if (!teacher || !parent) {
    fail("class teacher or parent is missing");
    return;
  }

  const teacherToken = generateToken(teacher);
  const parentToken = generateToken(parent);
  const stamp = Date.now();
  const parentText = `realtime-test-parent-${stamp}`;
  const teacherText = `realtime-test-teacher-${stamp}`;
  let chatId = null;
  let createdChat = false;
  let previous = null;
  const createdMessageIds = [];
  let teacherSocket = null;
  let parentSocket = null;

  try {
    const existing = await Chat.findOne({
      teacher: teacher._id,
      children: child._id,
    }).lean();
    createdChat = !existing;

    const opened = await req(
      "POST",
      "/chat/createChat",
      {
        teacher: String(teacher._id),
        parent: String(parent._id),
        children: String(child._id),
      },
      teacherToken,
    );
    chatId = opened.json.data?._id;
    if (!chatId) {
      fail(`create chat failed: ${opened.json.message || opened.status}`);
      return;
    }
    previous = await Chat.findById(chatId).lean();

    const again = await req(
      "POST",
      "/chat/createChat",
      {
        teacher: String(teacher._id),
        parent: String(parent._id),
        children: String(child._id),
      },
      parentToken,
    );
    if (String(again.json.data?._id) !== String(chatId)) {
      fail("parent and teacher did not share the same chat room");
      return;
    }
    console.log("PASS both sides open the same room");

    const teacherConn = await connect(teacherToken);
    const parentConn = await connect(parentToken);
    teacherSocket = teacherConn.socket;
    parentSocket = parentConn.socket;
    if (teacherConn.payload.role !== "teacher" || parentConn.payload.role !== "parent") {
      fail(`unexpected socket roles ${teacherConn.payload.role}/${parentConn.payload.role}`);
      return;
    }
    await joinChat(teacherSocket, chatId);
    await joinChat(parentSocket, chatId);
    console.log("PASS both sockets joined the room");

    const teacherHeard = waitForMessage(teacherSocket, parentText);
    const sentByParent = await req(
      "POST",
      "/message/createMessage",
      { chatId, content: parentText, senderType: "parent" },
      parentToken,
    );
    if (!sentByParent.json.data?.message?._id) {
      fail(`parent send failed: ${sentByParent.json.message || sentByParent.status}`);
      return;
    }
    createdMessageIds.push(sentByParent.json.data.message._id);
    const liveForTeacher = await teacherHeard;
    if (String(liveForTeacher.chat) !== String(chatId)) {
      fail("teacher received a message for a different room");
      return;
    }
    console.log("PASS parent message arrived live for the teacher");

    const parentHeard = waitForMessage(parentSocket, teacherText);
    const sentByTeacher = await req(
      "POST",
      "/message/createMessage",
      { chatId, content: teacherText, senderType: "teacher" },
      teacherToken,
    );
    if (!sentByTeacher.json.data?.message?._id) {
      fail(`teacher send failed: ${sentByTeacher.json.message || sentByTeacher.status}`);
      return;
    }
    createdMessageIds.push(sentByTeacher.json.data.message._id);
    const liveForParent = await parentHeard;
    if (String(liveForParent.chat) !== String(chatId)) {
      fail("parent received a message for a different room");
      return;
    }
    console.log("PASS teacher message arrived live for the parent");
  } finally {
    teacherSocket?.close();
    parentSocket?.close();
    if (createdMessageIds.length) {
      await Message.deleteMany({ _id: { $in: createdMessageIds } });
    }
    if (chatId && createdChat) {
      await Chat.deleteOne({ _id: chatId });
    } else if (chatId && previous) {
      await Chat.findByIdAndUpdate(chatId, {
        latestMessage: previous.latestMessage || null,
        parentUnread: previous.parentUnread || 0,
        teacherUnread: previous.teacherUnread || 0,
        unreadMessage: previous.unreadMessage || 0,
      });
    }
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("FAIL", error.message);
  process.exitCode = 1;
  mongoose.disconnect().finally(() => process.exit(process.exitCode || 1));
});
