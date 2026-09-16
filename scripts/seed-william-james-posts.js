/**
 * Seed a handful of nice classroom posts for James William's children.
 * Some have 2 photos, some 3, one has a short video.
 *
 *   node scripts/seed-william-james-posts.js
 */
require("../config/loadEnv");
const fs = require("fs");
const path = require("path");
const Parent = require("../Models/Parent");
const Children = require("../Models/Children");
const Teacher = require("../Models/Teacher");
const Classroom = require("../Models/Classroom");
const Activity = require("../Models/Activity");
const Post = require("../Models/Post");

const UPLOAD_DIR = path.join(__dirname, "..", "Uploads");
const MARKER = "[James William]";

const MEDIA = [
  {
    file: "seed-wj-reading-1.jpg",
    url: "https://images.unsplash.com/photo-1485546246426-74dc88dec4d9?auto=format&fit=crop&w=900&q=80",
  },
  {
    file: "seed-wj-reading-2.jpg",
    url: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=900&q=80",
  },
  {
    file: "seed-wj-play-1.jpg",
    url: "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=900&q=80",
  },
  {
    file: "seed-wj-play-2.jpg",
    url: "https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=900&q=80",
  },
  {
    file: "seed-wj-play-3.jpg",
    url: "https://images.unsplash.com/photo-1472162072942-cd5147eb3902?auto=format&fit=crop&w=900&q=80",
  },
  {
    file: "seed-wj-art-1.jpg",
    url: "https://images.unsplash.com/photo-1596464716127-f2a82984de30?auto=format&fit=crop&w=900&q=80",
  },
  {
    file: "seed-wj-art-2.jpg",
    url: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=900&q=80",
  },
  {
    file: "seed-wj-art-3.jpg",
    url: "https://images.unsplash.com/photo-1607453998774-d533f65dac99?auto=format&fit=crop&w=900&q=80",
  },
  {
    file: "seed-wj-lunch-1.jpg",
    url: "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=900&q=80",
  },
  {
    file: "seed-wj-lunch-2.jpg",
    url: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80",
  },
  {
    file: "seed-wj-music.mp4",
    url: "https://www.w3schools.com/html/mov_bbb.mp4",
  },
];

const LOCAL_COPIES = [
  { from: "Gardening.png", to: "seed-wj-garden-1.png" },
  { from: "Playing.png", to: "seed-wj-garden-2.png" },
  { from: "Learning.png", to: "seed-wj-garden-3.png" },
  { from: "Music.png", to: "seed-wj-music-cover.png" },
];

async function download(url, filename) {
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  const dest = path.join(UPLOAD_DIR, filename);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1024) {
    console.log(`Already have ${filename}`);
    return filename;
  }
  const res = await fetch(url, {
    headers: { "User-Agent": "BirchwoodSeed/1.0" },
  });
  if (!res.ok) {
    throw new Error(`${filename}: ${res.status} ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(dest, buffer);
  console.log(`Saved ${filename} (${Math.round(buffer.length / 1024)} KB)`);
  return filename;
}

async function copyLocal(from, to) {
  const src = path.join(UPLOAD_DIR, from);
  const dest = path.join(UPLOAD_DIR, to);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing local media ${from} — run activity seed first.`);
  }
  await fs.promises.copyFile(src, dest);
  console.log(`Copied ${from} → ${to}`);
  return to;
}

function pickActivity(activities, title) {
  const match = activities.find(
    (item) => String(item.title).toLowerCase() === title.toLowerCase()
  );
  return match || activities[0];
}

async function seedWilliamJamesPosts() {
  const parent = await Parent.findOne({
    $or: [
      { email: "james.william@birchwood.local" },
      { fatherFirstName: "James", fatherLastName: "William" },
      { fatherFirstName: "William", fatherLastName: "James" },
    ],
  });
  if (!parent) {
    throw new Error("Could not find parent James William / William James.");
  }

  const children = await Children.find({
    $or: [{ parent: parent._id }, { _id: { $in: parent.childrens || [] } }],
  }).sort({ firstName: 1 });

  if (!children.length) {
    throw new Error(
      `Parent ${parent.fatherFirstName} ${parent.fatherLastName} has no assigned children.`
    );
  }

  const [teachers, activities] = await Promise.all([
    Teacher.find({ status: "ACTIVE" }).sort({ createdAt: 1 }),
    Activity.find({ status: "ACTIVE" }).sort({ createdAt: 1 }),
  ]);
  if (!teachers.length) throw new Error("No teachers found.");
  if (!activities.length) throw new Error("No activities found. Seed activities first.");

  const classroomIds = [
    ...new Set(children.map((child) => String(child.classroom || "")).filter(Boolean)),
  ];
  const classrooms = classroomIds.length
    ? await Classroom.find({ _id: { $in: classroomIds } })
    : [];

  const teacher =
    (classrooms[0] &&
      (await Teacher.findOne({
        $or: [{ classroom: classrooms[0]._id }, { classrooms: classrooms[0]._id }],
      }))) ||
    teachers[0];

  console.log(
    `Parent: ${parent.fatherFirstName} ${parent.fatherLastName} (${parent.email})`
  );
  children.forEach((child) => {
    console.log(`  Child: ${child.firstName} ${child.lastName} (${child.rollNumber})`);
  });

  for (const item of MEDIA) {
    await download(item.url, item.file);
  }
  for (const item of LOCAL_COPIES) {
    await copyLocal(item.from, item.to);
  }

  const removed = await Post.deleteMany({ content: { $regex: MARKER } });
  if (removed.deletedCount) {
    console.log(`Removed ${removed.deletedCount} previous James William posts.`);
  }

  const first = children[0];
  const second = children[1] || children[0];
  const allKids = children.map((child) => child._id);
  const classroom = first.classroom || classrooms[0]?._id;

  const hoursAgo = (hours) => new Date(Date.now() - hours * 60 * 60 * 1000);

  const parentDocs = await Parent.find({ status: "ACTIVE" })
    .select("_id")
    .sort({ createdAt: 1 })
    .limit(12);
  const parentIds = parentDocs.map((doc) => doc._id);
  if (!parentIds.length) {
    parentIds.push(parent._id);
  }

  const posts = [
    {
      content: `${MARKER} Music circle clip — the class sang our planting song together. Tap play for a short video from today.`,
      activity: pickActivity(activities, "Music")._id,
      children: allKids,
      images: ["seed-wj-music-cover.png"],
      videos: ["seed-wj-music.mp4"],
      createdAt: hoursAgo(2),
    },
    {
      content: `${MARKER} Quiet reading corner today — ${first.firstName} picked a favourite picture book and shared the ending with a friend.`,
      activity: pickActivity(activities, "Reading")._id,
      children: [first._id],
      images: ["seed-wj-reading-1.jpg", "seed-wj-reading-2.jpg"],
      videos: [],
      createdAt: hoursAgo(4),
    },
    {
      content: `${MARKER} Block city in full swing! ${second.firstName} helped design the towers, then we tested which ones could survive a gentle earthquake.`,
      activity: pickActivity(activities, "Playing")._id,
      children: [second._id],
      images: ["seed-wj-play-1.jpg", "seed-wj-play-2.jpg", "seed-wj-play-3.jpg"],
      videos: [],
      createdAt: hoursAgo(8),
    },
    {
      content: `${MARKER} Watercolour afternoon — both children mixed their own colours and painted a garden for the classroom window.`,
      activity: pickActivity(activities, "Learning")._id,
      children: allKids,
      images: ["seed-wj-art-1.jpg", "seed-wj-art-2.jpg", "seed-wj-art-3.jpg"],
      videos: [],
      createdAt: hoursAgo(22),
    },
    {
      content: `${MARKER} Family-style lunch: veggie pasta, cucumber sticks, and mango. ${first.firstName} tried a new vegetable and gave it a proud thumbs-up.`,
      activity: pickActivity(activities, "Eating")._id,
      children: [first._id],
      images: ["seed-wj-lunch-1.jpg", "seed-wj-lunch-2.jpg"],
      videos: [],
      createdAt: hoursAgo(28),
    },
    {
      content: `${MARKER} Garden club: watering, naming the herbs, and spotting a ladybird outdoors.`,
      activity: pickActivity(activities, "Gardening")._id,
      children: allKids,
      images: ["seed-wj-garden-1.png", "seed-wj-garden-2.png", "seed-wj-garden-3.png"],
      videos: [],
      createdAt: hoursAgo(50),
    },
    {
      content: `${MARKER} Outdoor discovery walk — ${second.firstName} collected three kinds of leaves and lined them up from tiny to tall.`,
      activity: pickActivity(activities, "Playing")._id,
      children: [second._id],
      images: ["seed-wj-garden-2.png", "seed-wj-garden-3.png", "seed-wj-play-3.jpg"],
      videos: [],
      createdAt: hoursAgo(70),
    },
  ];

  for (let i = 0; i < posts.length; i += 1) {
    const item = posts[i];
    // Spread a few parent likes across posts (3–7 each) so the feed looks alive.
    const likeCount = 3 + (i % 5);
    const likes = parentIds.slice(0, Math.min(likeCount, parentIds.length));
    await Post.create({
      content: item.content,
      author: teacher._id,
      activity: item.activity,
      type: "CHILD",
      children: item.children,
      classroom,
      status: "ACTIVE",
      images: item.images,
      videos: item.videos,
      likes,
      createdAt: item.createdAt,
      updatedAt: item.createdAt,
    });
    console.log(
      `Created post (${item.images.length} photos${item.videos.length ? ` + ${item.videos.length} video` : ""}, ${likes.length} likes): ${item.content.replace(`${MARKER} `, "").slice(0, 72)}…`
    );
  }

  console.log(`Seeded ${posts.length} posts for James William's children.`);
}

module.exports = { seedWilliamJamesPosts };

if (require.main === module) {
  const { runStandalone } = require("../Helpers/seedConnection");
  runStandalone(seedWilliamJamesPosts)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Failed to seed James William posts:", err.message);
      process.exit(1);
    });
}
