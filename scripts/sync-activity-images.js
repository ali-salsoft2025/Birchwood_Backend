require("../config/loadEnv");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Activity = require("../Models/Activity");

const UPLOAD_DIR = path.join(__dirname, "..", "Uploads");
const BACKEND_ROOT = path.join(__dirname, "..");

function activityImageDirs() {
  const dirs = [];
  if (process.env.ACTIVITY_IMAGES_DIR) {
    dirs.push(path.resolve(process.env.ACTIVITY_IMAGES_DIR));
  }
  dirs.push(
    path.join(BACKEND_ROOT, "public", "images"),
    path.join(BACKEND_ROOT, "..", "Birchwood_Admin", "public", "images"),
    path.join(BACKEND_ROOT, "..", "admin", "public", "images"),
  );
  return dirs;
}

/** Maps frontend SVG filename → activity record */
const ACTIVITY_IMAGES = [
  {
    file: "Reading.svg",
    title: "Reading",
    description: "Story time, quiet reading, and children exploring books.",
  },
  {
    file: "Sleeping.svg",
    title: "Sleeping",
    description: "Nap time, rest, and settling down for sleep.",
  },
  {
    file: "Playing.svg",
    title: "Playing",
    description: "Free play, toys, games, and imaginative activities.",
  },
  {
    file: "Eating.svg",
    title: "Eating",
    description: "Lunch, dinner, and mealtime with classmates.",
  },
  {
    file: "Snack time.svg",
    title: "Snack Time",
    description: "Morning snacks, fruit breaks, and light bites.",
  },
  {
    file: "Learning.svg",
    title: "Learning",
    description: "Lessons, worksheets, and classroom learning moments.",
  },
  {
    file: "Music.svg",
    title: "Music",
    description: "Singing, instruments, rhythm, and music sessions.",
  },
  {
    file: "Sports.svg",
    title: "Sports",
    description: "Running, sports drills, and active movement.",
  },
  {
    file: "Bath.svg",
    title: "Bath Time",
    description: "Washing up, bath routines, and bathroom activities.",
  },
  {
    file: "Handwash.svg",
    title: "Hand Washing",
    description: "Hand hygiene and washing routines.",
  },
  {
    file: "Brushing.svg",
    title: "Brushing",
    description: "Teeth brushing and oral hygiene routines.",
  },
  {
    file: "Painting.svg",
    title: "Painting",
    description: "Painting, colours, and creative art projects.",
  },
  {
    file: "Drawing.svg",
    title: "Drawing",
    description: "Drawing, sketching, and illustration activities.",
  },
  {
    file: "Dancing.svg",
    title: "Dancing",
    description: "Dance, movement, and rhythm activities.",
  },
  {
    file: "Gardening.svg",
    title: "Gardening",
    description: "Planting, watering, and outdoor garden activities.",
  },
  {
    file: "Brain.svg",
    title: "Brain Games",
    description: "Puzzles, thinking games, and cognitive activities.",
  },
  {
    file: "Quite time.svg",
    title: "Quiet Time",
    description: "Calm corners, relaxation, and quiet activities.",
  },
];

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function backendImageName(title) {
  return `activity-${slugify(title)}.svg`;
}

function findSourceSvg(sourceFile) {
  for (const dir of activityImageDirs()) {
    const sourcePath = path.join(dir, sourceFile);
    if (fs.existsSync(sourcePath)) {
      return sourcePath;
    }
  }
  return null;
}

function resolveActivityImagesDir() {
  for (const dir of activityImageDirs()) {
    if (fs.existsSync(path.join(dir, "Reading.svg"))) {
      return dir;
    }
  }
  return null;
}

async function copySvg(sourceFile, destFile) {
  const sourcePath = findSourceSvg(sourceFile);
  const destPath = path.join(UPLOAD_DIR, destFile);

  if (!sourcePath) {
    throw new Error(`Source SVG not found: ${sourceFile}`);
  }

  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.promises.copyFile(sourcePath, destPath);
  return destFile;
}

async function syncActivityImages() {
  if (!process.env.DB) {
    throw new Error("DB is not set in .env");
  }

  const sourceDir = resolveActivityImagesDir();
  if (!sourceDir) {
    throw new Error(
      `Activity SVGs not found in public/images. Looked in:\n- ${activityImageDirs().join("\n- ")}`
    );
  }

  await mongoose.connect(process.env.DB);

  const titles = ACTIVITY_IMAGES.map((item) => item.title);
  const removed = await Activity.deleteMany({ title: { $in: titles } });
  if (removed.deletedCount) {
    console.log(`Removed ${removed.deletedCount} existing activities to refresh.`);
  }

  for (const item of ACTIVITY_IMAGES) {
    const imageName = backendImageName(item.title);
    await copySvg(item.file, imageName);
    console.log(`Copied ${item.file} → Uploads/${imageName}`);

    await Activity.create({
      title: item.title,
      description: item.description,
      image: imageName,
      status: "ACTIVE",
    });
    console.log(`Created activity: ${item.title}`);
  }

  console.log(`Synced ${ACTIVITY_IMAGES.length} activities from frontend SVGs.`);
  await mongoose.disconnect();
}

module.exports = {
  ACTIVITY_IMAGES,
  slugify,
  backendImageName,
  copySvg,
  activityImageDirs,
  resolveActivityImagesDir,
  syncActivityImages,
};

if (require.main === module) {
  syncActivityImages().catch((error) => {
    console.error("Failed to sync activity images:", error.message);
    process.exit(1);
  });
}
