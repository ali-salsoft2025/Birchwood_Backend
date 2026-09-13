require("../config/loadEnv");
const {
  ACTIVITY_IMAGES,
  backendImageName,
  copySvg,
  slugify,
} = require("./sync-activity-images");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Activity = require("../Models/Activity");

const UPLOAD_DIR = path.join(__dirname, "..", "Uploads");

const ACTIVITY_DOWNLOADS = {
  Reading: "https://images.pexels.com/photos/256455/pexels-photo-256455.jpeg?auto=compress&cs=tinysrgb&w=640",
  Sleeping: "https://images.pexels.com/photos/3662667/pexels-photo-3662667.jpeg?auto=compress&cs=tinysrgb&w=640",
  Playing: "https://images.pexels.com/photos/861331/pexels-photo-861331.jpeg?auto=compress&cs=tinysrgb&w=640",
  Eating: "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=640",
  "Snack Time": "https://images.pexels.com/photos/1092730/pexels-photo-1092730.jpeg?auto=compress&cs=tinysrgb&w=640",
  Learning: "https://images.pexels.com/photos/8613089/pexels-photo-8613089.jpeg?auto=compress&cs=tinysrgb&w=640",
  Music: "https://images.pexels.com/photos/164821/pexels-photo-164821.jpeg?auto=compress&cs=tinysrgb&w=640",
  Sports: "https://images.pexels.com/photos/296301/pexels-photo-296301.jpeg?auto=compress&cs=tinysrgb&w=640",
  "Bath Time": "https://images.pexels.com/photos/6844970/pexels-photo-6844970.jpeg?auto=compress&cs=tinysrgb&w=640",
  "Hand Washing": "https://images.pexels.com/photos/3987142/pexels-photo-3987142.jpeg?auto=compress&cs=tinysrgb&w=640",
  Brushing: "https://images.pexels.com/photos/6627536/pexels-photo-6627536.jpeg?auto=compress&cs=tinysrgb&w=640",
  Painting: "https://images.pexels.com/photos/159579/pexels-photo-159579.jpeg?auto=compress&cs=tinysrgb&w=640",
  Drawing: "https://images.pexels.com/photos/1148998/pexels-photo-1148998.jpeg?auto=compress&cs=tinysrgb&w=640",
  Dancing: "https://images.pexels.com/photos/1701202/pexels-photo-1701202.jpeg?auto=compress&cs=tinysrgb&w=640",
  Gardening: "https://images.pexels.com/photos/1301856/pexels-photo-1301856.jpeg?auto=compress&cs=tinysrgb&w=640",
  "Brain Games": "https://images.pexels.com/photos/4145190/pexels-photo-4145190.jpeg?auto=compress&cs=tinysrgb&w=640",
  "Quiet Time": "https://images.pexels.com/photos/3662667/pexels-photo-3662667.jpeg?auto=compress&cs=tinysrgb&w=640",
};

async function downloadRaster(url, filename) {
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  const dest = path.join(UPLOAD_DIR, filename);
  const res = await fetch(url, {
    headers: { "User-Agent": "BirchwoodSeedScript/1.0 (activity illustration seeder)" },
  });
  if (!res.ok) {
    throw new Error(`Could not download ${url} (${res.status})`);
  }
  await fs.promises.writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return filename;
}

async function ensureActivityImage(item) {
  const svgName = backendImageName(item.title);
  try {
    await copySvg(item.file, svgName);
    return svgName;
  } catch (error) {
    console.log(`Illustration skipped for ${item.title}: ${error.message}`);
  }

  const url = ACTIVITY_DOWNLOADS[item.title];
  if (!url) {
    return svgName;
  }

  const jpgName = `activity-${slugify(item.title)}.jpg`;
  await downloadRaster(url, jpgName);
  return jpgName;
}

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

  const titles = [...ACTIVITY_IMAGES.map((item) => item.title), ...LEGACY_TITLES];
  const removed = await Activity.deleteMany({ title: { $in: titles } });
  if (removed.deletedCount) {
    console.log(`Removed ${removed.deletedCount} previously seeded activities.`);
  }

  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });

  for (const item of ACTIVITY_IMAGES) {
    let imageName = backendImageName(item.title);
    try {
      imageName = await ensureActivityImage(item);
      console.log(`Illustration saved: ${imageName}`);
    } catch (error) {
      console.log(`Illustration skipped for ${item.title}: ${error.message}`);
    }

    await Activity.create({
      title: item.title,
      description: item.description,
      image: imageName,
      status: "ACTIVE",
    });
    console.log(`Created ${item.title} (ACTIVE)`);
  }

  console.log(`Seeded ${ACTIVITY_IMAGES.length} post categories from frontend SVGs.`);
}

module.exports = { seedActivities };

if (require.main === module) {
  const { runStandalone } = require("../Helpers/seedConnection");
  runStandalone(seedActivities).catch((error) => {
    console.error("Failed to seed activities:", error.message);
    process.exit(1);
  });
}
