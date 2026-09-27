require("../config/loadEnv");
const fs = require("fs");
const path = require("path");
const Gallery = require("../Models/Gallery");

const UPLOAD_DIR = path.join(__dirname, "..", "Uploads");

const ALBUMS = [
  {
    title: "Campus life",
    caption: "Everyday moments around Birchwood Academy",
    images: [
      {
        name: "seed-gallery-campus-1.jpg",
        url: "https://images.pexels.com/photos/8613089/pexels-photo-8613089.jpeg?auto=compress&cs=tinysrgb&w=1200",
      },
      {
        name: "seed-gallery-campus-2.jpg",
        url: "https://images.pexels.com/photos/8613086/pexels-photo-8613086.jpeg?auto=compress&cs=tinysrgb&w=1200",
      },
      {
        name: "seed-gallery-campus-3.jpg",
        url: "https://images.pexels.com/photos/8613318/pexels-photo-8613318.jpeg?auto=compress&cs=tinysrgb&w=1200",
      },
    ],
  },
  {
    title: "Sports day",
    caption: "Games, races, and team spirit on the field",
    images: [
      {
        name: "seed-gallery-sports-1.jpg",
        url: "https://images.pexels.com/photos/296301/pexels-photo-296301.jpeg?auto=compress&cs=tinysrgb&w=1200",
      },
      {
        name: "seed-gallery-sports-2.jpg",
        url: "https://images.pexels.com/photos/863988/pexels-photo-863988.jpeg?auto=compress&cs=tinysrgb&w=1200",
      },
      {
        name: "seed-gallery-sports-3.jpg",
        url: "https://images.pexels.com/photos/399187/pexels-photo-399187.jpeg?auto=compress&cs=tinysrgb&w=1200",
      },
    ],
  },
  {
    title: "Library & learning",
    caption: "Quiet corners and curious minds",
    images: [
      {
        name: "seed-gallery-library-1.jpg",
        url: "https://images.pexels.com/photos/256455/pexels-photo-256455.jpeg?auto=compress&cs=tinysrgb&w=1200",
      },
      {
        name: "seed-gallery-library-2.jpg",
        url: "https://images.pexels.com/photos/159711/books-bookstore-book-reading-159711.jpeg?auto=compress&cs=tinysrgb&w=1200",
      },
      {
        name: "seed-gallery-library-3.jpg",
        url: "https://images.pexels.com/photos/4145354/pexels-photo-4145354.jpeg?auto=compress&cs=tinysrgb&w=1200",
      },
    ],
  },
];

async function downloadImage(url, filename) {
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  const dest = path.join(UPLOAD_DIR, filename);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log(`Image kept: ${filename}`);
    return filename;
  }
  const res = await fetch(url, {
    headers: {
      "User-Agent": "BirchwoodSeedScript/1.0 (school gallery seeder)",
    },
  });
  if (!res.ok) {
    throw new Error(`Could not download ${url} (${res.status})`);
  }
  await fs.promises.writeFile(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`Image downloaded: ${filename}`);
  return filename;
}

async function seedGallery() {
  if (!process.env.DB) {
    throw new Error("DB is not set in .env");
  }

  const titles = ALBUMS.map((item) => item.title);
  const removed = await Gallery.deleteMany({
    $or: [{ title: { $in: titles } }, { images: { $elemMatch: { $regex: /^seed-gallery-/ } } }],
  });
  if (removed.deletedCount) {
    console.log(`Removed ${removed.deletedCount} previously seeded galleries.`);
  }

  for (const album of ALBUMS) {
    const images = [];
    for (const image of album.images) {
      images.push(await downloadImage(image.url, image.name));
    }
    await Gallery.create({
      title: album.title,
      caption: album.caption,
      images,
      status: "ACTIVE",
    });
    console.log(`Created gallery album: ${album.title} (${images.length} images)`);
  }

  console.log(`Seeded ${ALBUMS.length} school gallery albums.`);
}

module.exports = { seedGallery };

if (require.main === module) {
  const { runStandalone } = require("../Helpers/seedConnection");
  runStandalone(seedGallery)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Failed to seed gallery:", err.message);
      process.exit(1);
    });
}
