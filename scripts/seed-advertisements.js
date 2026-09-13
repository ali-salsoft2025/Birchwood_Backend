require("../config/loadEnv");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Advertisement = require("../Models/Advertisement");

const UPLOAD_DIR = path.join(__dirname, "..", "Uploads");
const ADMIN_IMAGES_DIR = path.join(
  __dirname,
  "..",
  "..",
  "Birchwood_Admin",
  "public",
  "images"
);

const ADS = [
  {
    title: "Open enrolment 2026",
    link: "https://thebirchwoodacademy.com",
    order: 1,
    localFile: "cover.png",
    imageUrl:
      "https://images.pexels.com/photos/8613089/pexels-photo-8613089.jpeg?auto=compress&cs=tinysrgb&w=1200",
  },
  {
    title: "After-school clubs",
    link: "https://thebirchwoodacademy.com",
    order: 2,
    localFile: "cover_1.png",
    imageUrl:
      "https://images.pexels.com/photos/8613086/pexels-photo-8613086.jpeg?auto=compress&cs=tinysrgb&w=1200",
  },
  {
    title: "Sports day",
    link: "https://thebirchwoodacademy.com",
    order: 3,
    localFile: "cover_2.png",
    imageUrl:
      "https://images.pexels.com/photos/296301/pexels-photo-296301.jpeg?auto=compress&cs=tinysrgb&w=1200",
  },
  {
    title: "Library week",
    link: "https://thebirchwoodacademy.com",
    order: 4,
    imageUrl:
      "https://images.pexels.com/photos/256455/pexels-photo-256455.jpeg?auto=compress&cs=tinysrgb&w=1200",
  },
];

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function copyLocal(sourceName, destName) {
  const sourcePath = path.join(ADMIN_IMAGES_DIR, sourceName);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Local image not found: ${sourceName}`);
  }
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.promises.copyFile(sourcePath, path.join(UPLOAD_DIR, destName));
  return destName;
}

async function downloadImage(url, filename) {
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  const dest = path.join(UPLOAD_DIR, filename);
  const res = await fetch(url, {
    headers: {
      "User-Agent": "BirchwoodSeedScript/1.0 (advertisement banner seeder)",
    },
  });
  if (!res.ok) {
    throw new Error(`Could not download ${url} (${res.status})`);
  }
  await fs.promises.writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return filename;
}

async function ensureBanner(item) {
  const filename = `seed-ad-${slugify(item.title)}.jpg`;
  if (item.localFile) {
    try {
      const destName = `seed-ad-${slugify(item.title)}${path.extname(item.localFile)}`;
      await copyLocal(item.localFile, destName);
      console.log(`Banner copied: ${item.localFile} → ${destName}`);
      return destName;
    } catch (error) {
      console.log(`Local banner skipped for ${item.title}: ${error.message}`);
    }
  }
  await downloadImage(item.imageUrl, filename);
  console.log(`Banner downloaded: ${filename}`);
  return filename;
}

async function seedAdvertisements() {
  if (!process.env.DB) {
    throw new Error("DB is not set in .env");
  }

  const titles = ADS.map((item) => item.title);
  const removed = await Advertisement.deleteMany({
    $or: [{ title: { $in: titles } }, { image: { $regex: /^seed-ad-/ } }],
  });
  if (removed.deletedCount) {
    console.log(`Removed ${removed.deletedCount} previously seeded advertisements.`);
  }

  for (const item of ADS) {
    const image = await ensureBanner(item);
    await Advertisement.create({
      title: item.title,
      link: item.link,
      order: item.order,
      image,
      status: "ACTIVE",
    });
    console.log(`Created advertisement: ${item.title}`);
  }

  console.log(`Seeded ${ADS.length} advertisements.`);
}

module.exports = { seedAdvertisements };

if (require.main === module) {
  const { runStandalone } = require("../Helpers/seedConnection");
  runStandalone(seedAdvertisements)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Failed to seed advertisements:", err.message);
      process.exit(1);
    });
}
