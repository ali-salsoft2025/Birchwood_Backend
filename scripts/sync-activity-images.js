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

/** Maps public/images filename → activity record */
const ACTIVITY_IMAGES = [
  {
    file: "Reading.png",
    title: "Reading",
    description: "Story time, quiet reading, and children exploring books.",
  },
  {
    file: "Sleeping.png",
    title: "Sleeping",
    description: "Nap time, rest, and settling down for sleep.",
  },
  {
    file: "Playing.png",
    title: "Playing",
    description: "Free play, toys, games, and imaginative activities.",
  },
  {
    file: "Eating.png",
    title: "Eating",
    description: "Lunch, dinner, and mealtime with classmates.",
  },
  {
    file: "Snack time.png",
    title: "Snack Time",
    description: "Morning snacks, fruit breaks, and light bites.",
  },
  {
    file: "Learning.png",
    title: "Learning",
    description: "Lessons, worksheets, and classroom learning moments.",
  },
  {
    file: "Music.png",
    title: "Music",
    description: "Singing, instruments, rhythm, and music sessions.",
  },
  {
    file: "Sports.png",
    title: "Sports",
    description: "Running, sports drills, and active movement.",
  },
  {
    file: "Bath.png",
    title: "Bath Time",
    description: "Washing up, bath routines, and bathroom activities.",
  },
  {
    file: "Handwash.png",
    title: "Hand Washing",
    description: "Hand hygiene and washing routines.",
  },
  {
    file: "Brushing.png",
    title: "Brushing",
    description: "Teeth brushing and oral hygiene routines.",
  },
  {
    file: "Painting.png",
    title: "Painting",
    description: "Painting, colours, and creative art projects.",
  },
  {
    file: "Drawing.png",
    title: "Drawing",
    description: "Drawing, sketching, and illustration activities.",
  },
  {
    file: "Dancing.png",
    title: "Dancing",
    description: "Dance, movement, and rhythm activities.",
  },
  {
    file: "Gardening.png",
    title: "Gardening",
    description: "Planting, watering, and outdoor garden activities.",
  },
  {
    file: "Brain.png",
    title: "Brain Games",
    description: "Puzzles, thinking games, and cognitive activities.",
  },
  {
    file: "Quite time.png",
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
  return `activity-${slugify(title)}.png`;
}

function findSourceImage(sourceFile) {
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
    if (fs.existsSync(path.join(dir, "Reading.png"))) {
      return dir;
    }
  }
  return null;
}

function leftoverUploadNames(item) {
  const slug = slugify(item.title);
  const stem = path.parse(item.file).name;
  return [
    `${stem}.svg`,
    `activity-${slug}.svg`,
    `activity-${slug}.png`,
    `seed-activity-${slug}.svg`,
    `seed-activity-${slug}.png`,
  ];
}

async function clearLegacyActivityUploads() {
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  for (const item of ACTIVITY_IMAGES) {
    for (const name of leftoverUploadNames(item)) {
      const leftoverPath = path.join(UPLOAD_DIR, name);
      if (fs.existsSync(leftoverPath)) {
        await fs.promises.unlink(leftoverPath);
        console.log(`Removed leftover Uploads/${name}`);
      }
    }
  }
}

async function copyActivityImage(sourceFile, destFile = sourceFile) {
  const sourcePath = findSourceImage(sourceFile);
  const destPath = path.join(UPLOAD_DIR, destFile);

  if (!sourcePath) {
    throw new Error(`Source image not found: ${sourceFile}`);
  }

  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.promises.copyFile(sourcePath, destPath);
  return destFile;
}

const copySvg = copyActivityImage;

async function syncActivityImages() {
  if (!process.env.DB) {
    throw new Error("DB is not set in .env");
  }

  const sourceDir = resolveActivityImagesDir();
  if (!sourceDir) {
    throw new Error(
      `Activity images not found in public/images. Looked in:\n- ${activityImageDirs().join("\n- ")}`
    );
  }

  await mongoose.connect(process.env.DB);

  const titles = ACTIVITY_IMAGES.map((item) => item.title);
  const removed = await Activity.deleteMany({ title: { $in: titles } });
  if (removed.deletedCount) {
    console.log(`Removed ${removed.deletedCount} existing activities to refresh.`);
  }

  await clearLegacyActivityUploads();

  for (const item of ACTIVITY_IMAGES) {
    await copyActivityImage(item.file, item.file);
    console.log(`Copied ${item.file} → Uploads/${item.file}`);

    await Activity.create({
      title: item.title,
      description: item.description,
      image: item.file,
      status: "ACTIVE",
    });
    console.log(`Created activity: ${item.title}`);
  }

  console.log(`Synced ${ACTIVITY_IMAGES.length} activities from public/images PNGs.`);
  await mongoose.disconnect();
}

module.exports = {
  ACTIVITY_IMAGES,
  slugify,
  backendImageName,
  copySvg,
  copyActivityImage,
  clearLegacyActivityUploads,
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
