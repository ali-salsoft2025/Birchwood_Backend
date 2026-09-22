/**
 * Assign-child API flow against local backend.
 * Creates a temporary parent + student, links them, then cleans up.
 * Run: node scripts/test-assign-child.js
 */
require("../config/loadEnv");
const mongoose = require("mongoose");
const Children = require("../Models/Children");
const Parent = require("../Models/Parent");

const BASE = process.env.API_BASE || "http://localhost:3031/api";

function fail(message) {
  console.error("FAIL", message);
  process.exitCode = 1;
}

async function req(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
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
  const email = `assign.test.${unique}@birchwood.test`;
  const password = "Parent@Test99";
  const rollNumber = `T${String(unique).slice(-6)}`;
  const birthday = "2018-04-12";
  let childId = null;
  let parentId = null;

  try {
    const signup = await req("POST", "/auth/signup", {
      fatherFirstName: "Assign",
      fatherLastName: "Tester",
      motherFirstName: "Assign",
      motherLastName: "Tester",
      email,
      phone: "5550001111",
      password,
    });
    if (signup.status !== 200 || signup.json.status !== true) {
      fail(`signup failed: ${signup.status} ${signup.json.message}`);
      return;
    }
    console.log("PASS signup");

    const signin = await req("POST", "/auth/signin", { email, password });
    const token = signin.json.data?.token;
    parentId = signin.json.data?.user?._id || signin.json.data?.parent?._id;
    if (!token) {
      fail(`signin failed: ${signin.status} ${signin.json.message}`);
      return;
    }
    console.log("PASS signin");

    const missing = await req(
      "POST",
      "/profile/assignChild",
      { rollNumber },
      token,
    );
    if (missing.status !== 400 || missing.json.status !== false) {
      fail(`missing birthday should 400, got ${missing.status} ${missing.json.message}`);
    } else {
      console.log("PASS rejects missing birthday");
    }

    const child = await Children.create({
      rollNumber,
      term: "2026",
      firstName: "Testassign",
      lastName: "Child",
      birthday: new Date(`${birthday}T00:00:00.000Z`),
      status: "ACTIVE",
    });
    childId = child._id;

    const mismatch = await req(
      "POST",
      "/profile/assignChild",
      { rollNumber, birthday: "2010-01-01" },
      token,
    );
    if (mismatch.status !== 400 || mismatch.json.status !== false) {
      fail(`wrong birthday should 400, got ${mismatch.status} ${mismatch.json.message}`);
    } else {
      console.log("PASS rejects mismatched birthday");
    }

    const assign = await req(
      "POST",
      "/profile/assignChild",
      { rollNumber: rollNumber.toLowerCase(), birthday },
      token,
    );
    if (assign.status !== 200 || assign.json.status !== true) {
      fail(`assign failed: ${assign.status} ${assign.json.message}`);
    } else {
      console.log("PASS assign child");
    }

    const children = await req("GET", "/profile/getAllMyChildren", null, token);
    const list = children.json.data?.children || [];
    const found = list.some(
      (item) => String(item._id) === String(childId) || item.rollNumber === rollNumber,
    );
    if (!found) {
      fail("linked child not returned by getAllMyChildren");
    } else {
      console.log("PASS child appears in parent children list");
    }

    const again = await req(
      "POST",
      "/profile/assignChild",
      { rollNumber, birthday },
      token,
    );
    if (again.status !== 200 || again.json.status !== true) {
      fail(`re-assign same parent should succeed, got ${again.status} ${again.json.message}`);
    } else {
      console.log("PASS re-assign same parent is idempotent");
    }
  } finally {
    if (childId) {
      await Children.findByIdAndDelete(childId);
    }
    if (parentId) {
      await Parent.findByIdAndUpdate(parentId, { $pull: { childrens: childId } });
    }
    await Parent.deleteOne({ email });
    await mongoose.disconnect();
  }

  if (process.exitCode === 1) {
    process.exit(1);
  }
  console.log("Assign child flow passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
