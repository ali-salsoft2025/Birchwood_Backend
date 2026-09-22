/**
 * Parent profile get/update + photo replace against local backend.
 * Run: node scripts/test-parent-profile-update.js
 */
require("../config/loadEnv");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
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
  return Boolean(name) && fs.existsSync(path.join(UPLOAD_DIR, name));
}

async function main() {
  if (!process.env.DB) {
    throw new Error("DB is not set");
  }
  await mongoose.connect(process.env.DB);

  const unique = Date.now();
  const email = `profile.test.${unique}@birchwood.test`;
  const password = "Parent@Test99";
  let parentId = null;
  const createdFiles = [];

  try {
    const signup = await req("POST", "/auth/signup", {
      fatherFirstName: "Profile",
      fatherLastName: "Tester",
      motherFirstName: "Profile",
      motherLastName: "Tester",
      email,
      phone: "5550002222",
      password,
      address: "Test street",
      city: "Test city",
      state: "TS",
    });
    if (signup.json.status !== true) {
      fail(`signup failed: ${signup.status} ${signup.json.message}`);
      return;
    }
    console.log("PASS signup");

    const signin = await req("POST", "/auth/signin", { email, password });
    const token = signin.json.data?.token;
    parentId = signin.json.data?.parent?._id;
    if (!token) {
      fail(`signin failed: ${signin.status} ${signin.json.message}`);
      return;
    }
    console.log("PASS signin");

    const profile = await req("GET", "/profile/getProfile", null, token);
    const user = profile.json.data;
    if (profile.json.status !== true || !user?._id) {
      fail(`getProfile failed: ${profile.status} ${profile.json.message}`);
    } else if (
      user.fatherFirstName !== "Profile" ||
      user.email !== email ||
      user.phone !== "5550002222"
    ) {
      fail("getProfile fields do not match signup");
    } else {
      console.log("PASS getProfile fields");
    }

    const updated = await req(
      "POST",
      "/profile/updateProfile",
      {
        fatherFirstName: "James",
        fatherLastName: "Updated",
        motherFirstName: "Helen",
        motherLastName: "Updated",
        phone: "+15550201234",
        address: "Jl. Kemang",
        city: "Jakarta",
        state: "DKI",
      },
      token,
    );
    const after = updated.json.data;
    if (updated.json.status !== true) {
      fail(`json update failed: ${updated.status} ${updated.json.message}`);
    } else if (
      after.fatherFirstName !== "James" ||
      after.city !== "Jakarta" ||
      after.email !== email
    ) {
      fail("json update did not persist allowed fields / mutated email");
    } else {
      console.log("PASS update text fields, email unchanged");
    }

    const first = new FormData();
    first.append("fatherFirstName", "James");
    first.append("motherFirstName", "Helen");
    first.append(
      "fatherImage",
      new Blob([TINY_PNG], { type: "image/png" }),
      "dad-old.png",
    );
    const firstUpload = await req(
      "POST",
      "/profile/updateProfile",
      first,
      token,
      true,
    );
    const firstName = firstUpload.json.data?.fatherImage;
    if (firstUpload.json.status !== true || !firstName) {
      fail(`first photo upload failed: ${firstUpload.status} ${firstUpload.json.message}`);
    } else if (!existsUpload(firstName)) {
      fail(`uploaded father photo missing from Uploads: ${firstName}`);
    } else {
      createdFiles.push(firstName);
      console.log("PASS first profile photo saved in Uploads");
    }

    const second = new FormData();
    second.append("fatherFirstName", "James");
    second.append("motherFirstName", "Helen");
    second.append(
      "fatherImage",
      new Blob([TINY_PNG], { type: "image/png" }),
      "dad-new.png",
    );
    const secondUpload = await req(
      "POST",
      "/profile/updateProfile",
      second,
      token,
      true,
    );
    const secondName = secondUpload.json.data?.fatherImage;
    if (secondUpload.json.status !== true || !secondName) {
      fail(`second photo upload failed: ${secondUpload.status} ${secondUpload.json.message}`);
    } else if (secondName === firstName) {
      fail("new photo reused old filename");
    } else if (existsUpload(firstName)) {
      fail(`old photo still in Uploads: ${firstName}`);
    } else if (!existsUpload(secondName)) {
      fail(`new photo missing from Uploads: ${secondName}`);
    } else {
      createdFiles.push(secondName);
      console.log("PASS replacing photo deletes old Uploads file");
    }
  } finally {
    createdFiles.forEach((name) => {
      const filePath = path.join(UPLOAD_DIR, name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });
    if (parentId) {
      const leftover = await Parent.findById(parentId);
      ["fatherImage", "motherImage", "image"].forEach((key) => {
        const name = leftover?.[key];
        if (name) {
          const filePath = path.join(UPLOAD_DIR, name);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
      });
      await Parent.findByIdAndDelete(parentId);
    } else {
      await Parent.deleteOne({ email });
    }
    await mongoose.disconnect();
  }

  if (process.exitCode === 1) {
    process.exit(1);
  }
  console.log("Profile update flow passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
