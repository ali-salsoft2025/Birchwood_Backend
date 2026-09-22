const fs = require("fs");
const path = require("path");
const {
  replaceParentUploadedImages,
} = require("../Helpers/parentImages");
const { UPLOAD_DIR } = require("../Helpers/uploadFiles");

function writeDummy(name) {
  const filePath = path.join(UPLOAD_DIR, name);
  fs.writeFileSync(filePath, `old-or-new:${name}`);
  return filePath;
}

function exists(name) {
  return fs.existsSync(path.join(UPLOAD_DIR, name));
}

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const oldFather = `test-old-father-${Date.now()}.jpg`;
const oldMother = `test-old-mother-${Date.now()}.jpg`;
const newFather = `test-new-father-${Date.now()}.jpg`;
const keepMother = oldMother;

writeDummy(oldFather);
writeDummy(oldMother);
writeDummy(newFather);

const current = {
  fatherImage: oldFather,
  image: oldFather,
  motherImage: oldMother,
};

replaceParentUploadedImages(current, {
  fatherImage: newFather,
  image: newFather,
});

const oldGone = !exists(oldFather);
const newKept = exists(newFather);
const motherKept = exists(keepMother);

[newFather, keepMother].forEach((name) => {
  const filePath = path.join(UPLOAD_DIR, name);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
});
if (exists(oldFather)) {
  fs.unlinkSync(path.join(UPLOAD_DIR, oldFather));
}

if (!oldGone || !newKept || !motherKept) {
  console.error("Parent image replace test failed", {
    oldGone,
    newKept,
    motherKept,
  });
  process.exit(1);
}

console.log("Parent image replace test passed: old father photo deleted, new kept, mother untouched.");
