require("../config/loadEnv");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Children = require("../Models/Children");
const Parent = require("../Models/Parent");
const { seedEntityId } = require("../Helpers/seedIds");

const UPLOAD_DIR = path.join(__dirname, "..", "Uploads");

const STUDENTS = [
  { firstName: "Aiden", lastName: "Brooks", term: "2026", age: 6, birthday: "2020-03-14", gender: "men", photoId: 11, allergies: ["Peanuts"], fears: ["Loud noises"], conditions: [], summary: ["Friendly and curious in class."] },
  { firstName: "Maya", lastName: "Chen", term: "2026", age: 7, birthday: "2019-07-22", gender: "women", photoId: 12, allergies: ["Dairy"], fears: [], conditions: ["Mild asthma"], summary: ["Uses inhaler before PE.", "Prefers front-row seating."] },
  { firstName: "Leo", lastName: "Patel", term: "2026", age: 8, birthday: "2018-01-09", gender: "men", photoId: 13 },
  { firstName: "Sofia", lastName: "Rahman", term: "2026", age: 9, birthday: "2017-11-30", gender: "women", photoId: 14 },
  { firstName: "Noah", lastName: "Kim", term: "2026", age: 10, birthday: "2016-05-18", gender: "men", photoId: 15 },
  { firstName: "Emma", lastName: "Lopez", term: "2026", age: 11, birthday: "2015-09-02", gender: "women", photoId: 16 },
  { firstName: "Ethan", lastName: "Nguyen", term: "2026", age: 12, birthday: "2014-12-25", gender: "men", photoId: 17 },
  { firstName: "Zara", lastName: "Ali", term: "2026", age: 13, birthday: "2013-04-07", gender: "women", photoId: 18 },
  { firstName: "Lucas", lastName: "Martin", term: "2026", age: 14, birthday: "2012-08-19", gender: "men", photoId: 19 },
  { firstName: "Aria", lastName: "Singh", term: "2026", age: 5, birthday: "2021-02-11", gender: "women", photoId: 20 },
  { firstName: "Oliver", lastName: "Brown", term: "2026", age: 6, birthday: "2020-06-03", gender: "men", photoId: 21 },
  { firstName: "Lily", lastName: "Garcia", term: "2026", age: 7, birthday: "2019-10-16", gender: "women", photoId: 22 },
  { firstName: "Mason", lastName: "Wright", term: "2026", age: 8, birthday: "2018-03-28", gender: "men", photoId: 23 },
  { firstName: "Hana", lastName: "Yusuf", term: "2026", age: 9, birthday: "2017-07-05", gender: "women", photoId: 24 },
  { firstName: "Jack", lastName: "Turner", term: "2026", age: 10, birthday: "2016-01-21", gender: "men", photoId: 25 },
  { firstName: "Nina", lastName: "Scott", term: "2026", age: 11, birthday: "2015-05-13", gender: "women", photoId: 26 },
  { firstName: "Ryan", lastName: "Hassan", term: "2026", age: 12, birthday: "2014-09-27", gender: "men", photoId: 27 },
  { firstName: "Chloe", lastName: "Reed", term: "2026", age: 13, birthday: "2013-12-08", gender: "women", photoId: 28 },
  { firstName: "Ben", lastName: "Cooper", term: "2026", age: 14, birthday: "2012-02-17", gender: "men", photoId: 29 },
  { firstName: "Ivy", lastName: "Das", term: "2026", age: 5, birthday: "2021-08-01", gender: "women", photoId: 30 },
];

async function downloadPortrait(gender, photoId, filename) {
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  const dest = path.join(UPLOAD_DIR, filename);
  const url = `https://randomuser.me/api/portraits/${gender}/${photoId}.jpg`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not download ${url} (${res.status})`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(dest, buffer);
  return filename;
}

async function seedChildren() {
  if (!process.env.DB) {
    throw new Error("DB is not set in .env");
  }

  const seedRollNumbers = STUDENTS.map((_, index) => seedEntityId("S", index + 1));
  const removed = await Children.deleteMany({
    $or: [{ rollNumber: { $in: seedRollNumbers } }, { rollNumber: /^BW2026-/ }],
  });
  if (removed.deletedCount) {
    console.log(`Removed ${removed.deletedCount} previously seeded students.`);
  }

  await Parent.updateMany({ parentId: /^P\d{6}$/ }, { $set: { childrens: [] } });
  console.log("Cleared seeded parent.childrens links (students remain unassigned).");

  for (let index = 0; index < STUDENTS.length; index += 1) {
    const item = STUDENTS[index];
    const rollNumber = seedEntityId("S", index + 1);
    const imageName = `seed-student-${item.firstName.toLowerCase()}-${item.lastName.toLowerCase()}.jpg`;
    try {
      await downloadPortrait(item.gender, item.photoId, imageName);
      console.log(`Photo saved: ${imageName}`);
    } catch (error) {
      console.log(`Photo skipped for ${rollNumber}: ${error.message}`);
    }

    await Children.create({
      rollNumber,
      term: item.term,
      firstName: item.firstName,
      lastName: item.lastName,
      age: item.age,
      birthday: new Date(item.birthday),
      image: imageName,
      status: "ACTIVE",
      allergies: item.allergies || [],
      fears: item.fears || [],
      conditions: item.conditions || [],
      summary: item.summary?.length
        ? item.summary
        : [`${item.firstName} is a Birchwood student enrolled for term ${item.term}.`],
    });
    console.log(`Created ${item.firstName} ${item.lastName} (${rollNumber})`);
  }

  console.log(`Seeded ${STUDENTS.length} students without class or parent assignments.`);
}

module.exports = { seedChildren, STUDENTS };

if (require.main === module) {
  const { runStandalone } = require("../Helpers/seedConnection");
  runStandalone(seedChildren)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Failed to seed students:", err.message);
      process.exit(1);
    });
}
