const assert = require("assert");
const {
  safeImageName,
  isObjectId,
  publicGallery,
  publicJob,
  jobIsOpen,
} = require("../Helpers/publicPayload");

let failed = 0;
function check(name, condition) {
  try {
    assert.strictEqual(condition, true);
    console.log("PASS", name);
  } catch (error) {
    failed += 1;
    console.error("FAIL", name);
  }
}

check("plain photo name is kept", safeImageName("campus-1.jpg") === "campus-1.jpg");
check("path traversal is dropped", safeImageName("../secret.jpg") === "");
check("slash is dropped", safeImageName("a/b.jpg") === "");
check("object id shape", isObjectId("507f1f77bcf86cd799439011") === true);
check("short id is rejected", isObjectId("123") === false);

const album = publicGallery({
  _id: "507f1f77bcf86cd799439011",
  title: "Campus",
  caption: "Morning",
  images: ["ok.jpg", "../no.jpg", "also.png"],
  status: "ACTIVE",
  createdBy: "hidden",
});
check("gallery drops unsafe names", album.images.join(",") === "ok.jpg,also.png");
check("gallery does not expose extra fields", album.createdBy == null && album.status == null);

const open = { status: "OPEN", closingOn: null };
const closed = { status: "CLOSED", closingOn: null };
const expired = { status: "OPEN", closingOn: new Date("2020-01-01") };
check("open job stays public", jobIsOpen(open, new Date("2026-01-01")) === true);
check("closed job stays private", jobIsOpen(closed, new Date("2026-01-01")) === false);
check("expired job stays private", jobIsOpen(expired, new Date("2026-01-01")) === false);

const listed = publicJob({
  _id: "507f1f77bcf86cd799439011",
  title: "Teacher",
  description: "Full duties",
  status: "OPEN",
});
check("list payload omits the long description", listed.description == null);

if (failed) process.exit(1);
console.log("public payload ok");
