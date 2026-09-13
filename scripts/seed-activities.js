require("../config/loadEnv");
const {
  ACTIVITY_IMAGES,
  copySvg,
  resolveActivityImagesDir,
  activityImageDirs,
} = require("./sync-activity-images");
const fs = require("fs");
const path = require("path");
const Activity = require("../Models/Activity");

const UPLOAD_DIR = path.join(__dirname, "..", "Uploads");

const LEGACY_TITLES = [
  "Outdoor Play",
  "Arts & Crafts",
  "Sports & Exercise",
  "Water Play",
  "Sports Day",
  "Art Exhibition",
  "Science Fair",
  "Music Recital",
  "Book Week",
  "Museum Field Trip",
  "Swimming Carnival",
  "Coding Club Showcase",
  "Earth Day Cleanup",
  "Parent-Teacher Week",
  "Drama Club Rehearsal",
  "Garden Club Planting",
];

async function seedActivities() {
  if (!process.env.DB) {
    throw new Error("DB is not set in .env");
  }

  const sourceDir = resolveActivityImagesDir();
  if (!sourceDir) {
    throw new Error(
      `Activity SVGs not found in public/images. Push Reading.svg and the other activity files, then re-run seed. Looked in:\n- ${activityImageDirs().join("\n- ")}`
    );
  }
  console.log(`Using activity illustrations from ${sourceDir}`);

  const titles = [...ACTIVITY_IMAGES.map((item) => item.title), ...LEGACY_TITLES];
  const removed = await Activity.deleteMany({ title: { $in: titles } });
  if (removed.deletedCount) {
    console.log(`Removed ${removed.deletedCount} previously seeded activities.`);
  }

  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });

  for (const item of ACTIVITY_IMAGES) {
    await copySvg(item.file, item.file);
    console.log(`Copied ${item.file} → Uploads/${item.file}`);

    await Activity.create({
      title: item.title,
      description: item.description,
      image: item.file,
      status: "ACTIVE",
    });
    console.log(`Created ${item.title} (ACTIVE)`);
  }

  console.log(`Seeded ${ACTIVITY_IMAGES.length} activities from public/images SVGs.`);
}

module.exports = { seedActivities };

if (require.main === module) {
  const { runStandalone } = require("../Helpers/seedConnection");
  runStandalone(seedActivities).catch((error) => {
    console.error("Failed to seed activities:", error.message);
    process.exit(1);
  });
}
