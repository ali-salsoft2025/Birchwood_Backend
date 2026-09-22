/**
 * Parent can update only their linked child's health details.
 * Run: node scripts/test-update-child-health.js
 */
require("../config/loadEnv");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Children = require("../Models/Children");
const Parent = require("../Models/Parent");
const { UPLOAD_DIR } = require("../Helpers/uploadFiles");

const BASE = process.env.API_BASE || "http://localhost:3031/api";
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function fail(message) {
  console.error("FAIL", message);
  process.exitCode = 1;
}

async function req(method, urlPath, body, token, asForm = false) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!asForm) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: asForm ? body : body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function existsUpload(name) {
  return Boolean(name) && fs.existsSync(path.join(UPLOAD_DIR, path.basename(name)));
}

async function main() {
  if (!process.env.DB) {
    throw new Error("DB is not set");
  }
  await mongoose.connect(process.env.DB);

  const unique = Date.now();
  const email = `health.test.${unique}@birchwood.test`;
  const password = "Parent@Test99";
  const rollNumber = `H${String(unique).slice(-6)}`;
  let childId = null;
  let parentId = null;
  const createdFiles = [];

  try {
    const signup = await req("POST", "/auth/signup", {
      fatherFirstName: "Health",
      fatherLastName: "Tester",
      motherFirstName: "Health",
      motherLastName: "Tester",
      email,
      phone: "5550002222",
      password,
    });
    if (signup.status !== 200 || signup.json.status !== true) {
      fail(`signup failed: ${signup.status} ${signup.json.message}`);
      return;
    }

    const signin = await req("POST", "/auth/signin", { email, password });
    const token = signin.json.data?.token;
    parentId = signin.json.data?.user?._id || signin.json.data?.parent?._id;
    if (!token || !parentId) {
      fail(`signin failed: ${signin.status} ${signin.json.message}`);
      return;
    }

    const oldImage = `old-child-${unique}.png`;
    fs.writeFileSync(path.join(UPLOAD_DIR, oldImage), TINY_PNG);
    createdFiles.push(oldImage);

    const child = await Children.create({
      rollNumber,
      term: "2026",
      firstName: "Testhealth",
      lastName: "Child",
      birthday: new Date("2018-04-12T00:00:00.000Z"),
      status: "ACTIVE",
      parent: parentId,
      allergies: ["Peanuts"],
      image: oldImage,
    });
    childId = child._id;
    await Parent.findByIdAndUpdate(parentId, { $addToSet: { childrens: childId } });

    const stranger = await req(
      "POST",
      "/profile/updateChildHealth",
      { childId: new mongoose.Types.ObjectId().toString(), allergies: "Dust" },
      token,
    );
    if (stranger.status !== 404) {
      fail(`unknown child should 404, got ${stranger.status} ${stranger.json.message}`);
    } else {
      console.log("PASS unknown child rejected");
    }

    const saved = await req(
      "POST",
      "/profile/updateChildHealth",
      {
        childId: String(childId),
        allergies: "Peanuts, Dairy",
        conditions: "Mild asthma",
        fears: "",
        summary: "Uses inhaler before PE.\nPrefers a quiet corner.",
      },
      token,
    );
    if (saved.status !== 200 || saved.json.status !== true) {
      fail(`update failed: ${saved.status} ${saved.json.message}`);
      return;
    }
    const updated = saved.json.data?.child;
    const allergies = updated?.allergies || [];
    const notes = updated?.summary || [];
    if (
      allergies.join("|") !== "Peanuts|Dairy" ||
      (updated?.conditions || []).join("|") !== "Mild asthma" ||
      (updated?.fears || []).length !== 0 ||
      notes.join("|") !== "Uses inhaler before PE.|Prefers a quiet corner."
    ) {
      fail(`saved lists mismatch ${JSON.stringify(updated)}`);
    } else {
      console.log("PASS parent health update");
    }

    const stored = await Children.findById(childId).lean();
    if (stored.rollNumber !== rollNumber || stored.firstName !== "Testhealth") {
      fail("school fields were changed");
    } else if (stored.image !== oldImage || !existsUpload(oldImage)) {
      fail("text-only save changed or deleted the photo");
    } else {
      console.log("PASS school fields and existing photo unchanged");
    }

    const form = new FormData();
    form.append("childId", String(childId));
    form.append("allergies", "Peanuts");
    form.append("conditions", "");
    form.append("fears", "");
    form.append("summary", "Updated note");
    form.append("image", new Blob([TINY_PNG], { type: "image/png" }), "student.png");
    const replaced = await req("POST", "/profile/updateChildHealth", form, token, true);
    const newImage = replaced.json.data?.child?.image;
    const after = await Children.findById(childId).lean();
    if (replaced.status !== 200 || replaced.json.status !== true || !newImage) {
      fail(`photo replace failed: ${replaced.status} ${replaced.json.message}`);
    } else if (newImage === oldImage || after.image !== newImage) {
      fail(`database still points at the old photo: ${after.image}`);
    } else if (existsUpload(oldImage)) {
      fail(`old photo still in Uploads: ${oldImage}`);
    } else if (!existsUpload(newImage)) {
      fail(`new photo missing from Uploads: ${newImage}`);
    } else {
      createdFiles.push(newImage);
      console.log("PASS new photo saved and old photo deleted");
    }
  } finally {
    createdFiles.forEach((name) => {
      const filePath = path.join(UPLOAD_DIR, path.basename(name));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });
    if (childId) {
      const leftover = await Children.findById(childId).lean();
      if (leftover?.image) {
        const filePath = path.join(UPLOAD_DIR, path.basename(leftover.image));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
      await Children.findByIdAndDelete(childId);
    }
    if (parentId) {
      await Parent.findByIdAndDelete(parentId);
    }
    await mongoose.disconnect();
  }

  if (process.exitCode === 1) {
    process.exit(1);
  }
  console.log("Update child health flow passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});