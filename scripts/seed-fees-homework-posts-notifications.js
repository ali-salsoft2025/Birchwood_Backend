require("../config/loadEnv");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Fees = require("../Models/Fees");
const Homework = require("../Models/Homework");
const Post = require("../Models/Post");
const Notification = require("../Models/Notification");
const Children = require("../Models/Children");
const Teacher = require("../Models/Teacher");
const Classroom = require("../Models/Classroom");
const Activity = require("../Models/Activity");
const { generateFeeReceiptNo } = require("../Helpers/feeReceipt");
const { ACTIVITY_IMAGES } = require("./sync-activity-images");

const UPLOAD_DIR = path.join(__dirname, "..", "Uploads");

const NOTIFICATIONS = [
  {
    title: "School closed — severe weather",
    content:
      "Due to heavy rain and flooding advisories, Birchwood Academy will be closed tomorrow. Online resources will be shared on the parent portal.",
    type: "ALERT",
    isRead: false,
  },
  {
    title: "Payment reminder — March fees",
    content:
      "Fee vouchers for March 2026 are now available. Please settle outstanding balances before the due date to avoid late charges.",
    type: "ALERT",
    isRead: true,
  },
  {
    title: "Fire drill scheduled",
    content:
      "A mandatory fire drill will take place Friday at 10:00 AM. Teachers have been briefed; please ensure all students follow evacuation routes calmly.",
    type: "ALERT",
    isRead: false,
  },
  {
    title: "Parent-teacher conferences",
    content:
      "Conference slots for Term 2 are open. Book a 15-minute session with your child's homeroom teacher through the admin office.",
    type: "ANNOUNCEMENT",
    isRead: false,
  },
  {
    title: "New lunch menu — April",
    content:
      "Our kitchen team has updated the April menu with more fruit and vegetarian options. Allergen labels are posted in each classroom.",
    type: "ANNOUNCEMENT",
    isRead: true,
  },
  {
    title: "Sports day registration",
    content:
      "Annual sports day is on May 22. Students may sign up for relay, sack race, and tug-of-war events during PE this week.",
    type: "ANNOUNCEMENT",
    isRead: false,
  },
  {
    title: "Library hours extended",
    content:
      "The school library will stay open until 4:30 PM on Wednesdays for quiet reading and homework support.",
    type: "ANNOUNCEMENT",
    isRead: true,
  },
  {
    title: "Welcome back after break",
    content:
      "We hope everyone had a restful mid-term break. Classes resume at the usual time — please bring water bottles and sun hats for outdoor play.",
    type: "NOTIFICATION",
    isRead: false,
  },
  {
    title: "Class photo day",
    content:
      "Individual and class photos will be taken next Tuesday. Students should wear full school uniform and bring their brightest smiles.",
    type: "NOTIFICATION",
    isRead: true,
  },
  {
    title: "After-school club sign-up",
    content:
      "Coding club, art studio, and choir rehearsals open for sign-up this week. Spaces are limited — confirm with the front desk.",
    type: "NOTIFICATION",
    isRead: false,
  },
];

const SEED_HOMEWORK_TITLES = [
  "Phonics worksheet — short vowels",
  "Math — number bonds to 20",
  "Science — plant diary",
  "Reading log — 20 minutes",
  "Handwriting practice",
  "Class trip permission slip",
  "Swimming kit reminder",
  "Late homework warning",
  "Behaviour note — classroom noise",
];

function addDays(base, days) {
  const date = new Date(base);
  date.setDate(date.getDate() + days);
  return date;
}

function monthDueDate(year, month, day = 10) {
  return new Date(year, month - 1, day);
}

function activityImageFor(title) {
  const match = ACTIVITY_IMAGES.find((item) => item.title === title);
  const candidates = [match?.file, title && `${title}.svg`].filter(Boolean);
  for (const filename of candidates) {
    if (fs.existsSync(path.join(UPLOAD_DIR, filename))) {
      return filename;
    }
  }
  return null;
}

function requireEntities(label, items, min = 1) {
  if (!items.length) {
    throw new Error(`No ${label} found. Run the ${label} seed scripts first.`);
  }
  if (items.length < min) {
    console.warn(`Warning: only ${items.length} ${label} found (expected at least ${min}).`);
  }
}

async function clearPreviousSeedData() {
  const feeRemoved = await Fees.deleteMany({
    $or: [
      { receiptNo: { $regex: /^SEED/ } },
      { receiptNo: { $regex: /^FEE\d+$/ } },
      { receiptNo: { $regex: /^BW-FEE-/ } },
      { receiptNo: { $regex: /^BW-\d{4}-\d{2}-/ } },
    ],
  });
  if (feeRemoved.deletedCount) {
    console.log(`Removed ${feeRemoved.deletedCount} previously seeded fee vouchers.`);
  }

  const homeworkRemoved = await Homework.deleteMany({
    $or: [
      { title: { $regex: /^\[Seed\]/ } },
      { title: { $in: SEED_HOMEWORK_TITLES } },
    ],
  });
  if (homeworkRemoved.deletedCount) {
    console.log(`Removed ${homeworkRemoved.deletedCount} previously seeded homework items.`);
  }

  const postRemoved = await Post.deleteMany({
    content: { $regex: /^\[Seed\]/ },
  });
  if (postRemoved.deletedCount) {
    console.log(`Removed ${postRemoved.deletedCount} previously seeded posts.`);
  }

  const notificationTitles = NOTIFICATIONS.map((item) => item.title);
  const notifRemoved = await Notification.deleteMany({
    title: { $in: notificationTitles },
    isAdmin: true,
  });
  if (notifRemoved.deletedCount) {
    console.log(`Removed ${notifRemoved.deletedCount} previously seeded admin notifications.`);
  }
}

async function seedFees(children) {
  const year = 2026;
  const feePlans = [
    { month: 1, amount: 850, paid: true },
    { month: 2, amount: 850, paid: true },
    { month: 3, amount: 900, paid: false },
    { month: 4, amount: 900, paid: false },
    { month: 5, amount: 950, paid: false },
    { month: 6, amount: 950, paid: true },
    { month: 7, amount: 900, paid: false },
    { month: 8, amount: 900, paid: false },
    { month: 9, amount: 950, paid: false },
    { month: 10, amount: 950, paid: true },
    { month: 11, amount: 1000, paid: false },
    { month: 12, amount: 1000, paid: false },
  ];

  let created = 0;
  const targets = children.slice(0, Math.min(8, children.length));

  for (let childIndex = 0; childIndex < targets.length; childIndex += 1) {
    const child = targets[childIndex];
    const plans = feePlans.slice(0, childIndex % 2 === 0 ? 6 : 4);

    for (let planIndex = 0; planIndex < plans.length; planIndex += 1) {
      const plan = plans[planIndex];
      const receiptNo = await generateFeeReceiptNo(plan.month, year);
      const dueDate = monthDueDate(year, plan.month);
      const paymentDate = plan.paid ? addDays(dueDate, -2) : dueDate;

      await Fees.create({
        receiptNo,
        children: child._id,
        amount: plan.amount,
        month: plan.month,
        year,
        dueDate,
        paymentDate,
        isPaid: plan.paid,
      });
      created += 1;
    }
  }

  console.log(`Seeded ${created} fee vouchers for ${targets.length} students.`);
}

async function seedHomework({ teachers, classrooms, children }) {
  const teacher = teachers[0];
  const teacher2 = teachers[1] || teachers[0];
  const classroom = classrooms[0];
  const classroom2 = classrooms[1] || classrooms[0];
  const child = children[0];
  const child2 = children[1] || children[0];
  const now = new Date();

  const items = [
    {
      title: "Phonics worksheet — short vowels",
      description: "Complete pages 4–6 in the phonics workbook. Practice reading aloud with a parent.",
      teacher: teacher._id,
      classroom: classroom._id,
      assignee: "CLASS",
      type: "HOMEWORK",
      dueDate: addDays(now, 5),
    },
    {
      title: "Math — number bonds to 20",
      description: "Finish the number bond sheet and bring it back signed tomorrow morning.",
      teacher: teacher2._id,
      classroom: classroom2._id,
      assignee: "CLASS",
      type: "HOMEWORK",
      dueDate: addDays(now, 3),
    },
    {
      title: "Science — plant diary",
      description: "Observe your classroom plant for one week and draw what changes you notice.",
      teacher: teacher._id,
      classroom: classroom._id,
      assignee: "CLASS",
      type: "HOMEWORK",
      dueDate: addDays(now, 7),
    },
    {
      title: "Reading log — 20 minutes",
      description: "Read for 20 minutes tonight and ask an adult to sign your reading log.",
      teacher: teacher._id,
      children: child._id,
      assignee: "CHILD",
      type: "HOMEWORK",
      dueDate: addDays(now, 2),
    },
    {
      title: "Handwriting practice",
      description: "Practice lower-case letters a–m on the lined sheet sent home today.",
      teacher: teacher2._id,
      children: child2._id,
      assignee: "CHILD",
      type: "HOMEWORK",
      dueDate: addDays(now, 4),
    },
    {
      title: "Class trip permission slip",
      description: "Return the signed museum trip form by Friday. Students without a form cannot attend.",
      teacher: teacher._id,
      classroom: classroom._id,
      assignee: "CLASS",
      type: "NOTICE",
      dueDate: addDays(now, 6),
    },
    {
      title: "Swimming kit reminder",
      description: "Bring swimwear, towel, and flip-flops every Thursday for pool sessions.",
      teacher: teacher2._id,
      classroom: classroom2._id,
      assignee: "CLASS",
      type: "NOTICE",
      dueDate: addDays(now, 10),
    },
    {
      title: "Late homework warning",
      description: "Two assignments were submitted late this term. Please submit future work on time.",
      teacher: teacher._id,
      children: child._id,
      assignee: "CHILD",
      type: "WARNING",
      dueDate: addDays(now, 1),
    },
    {
      title: "Behaviour note — classroom noise",
      description: "Please remind your child to raise a hand and wait to be called on during lessons.",
      teacher: teacher2._id,
      children: child2._id,
      assignee: "CHILD",
      type: "WARNING",
      dueDate: addDays(now, 2),
    },
  ];

  for (const item of items) {
    await Homework.create({
      ...item,
      assignDate: addDays(now, -1),
      status: "ACTIVE",
    });
    console.log(`Created homework: ${item.title}`);
  }

  console.log(`Seeded ${items.length} homework / notice / warning items.`);
}

async function seedPosts({ teachers, classrooms, children, activities }) {
  const activityByTitle = (title) => activities.find((item) => item.title === title) || activities[0];
  const reading = activityByTitle("Reading");
  const playing = activityByTitle("Playing");
  const eating = activityByTitle("Eating");
  const outdoor = activityByTitle("Outdoor Play");
  const arts = activityByTitle("Arts & Crafts");
  const music = activityByTitle("Music");
  const learning = activityByTitle("Learning");
  const sports = activityByTitle("Sports & Exercise");

  const posts = [
    {
      content: "[Seed] Story circle was wonderful today — everyone took turns reading from our favourite picture books.",
      author: teachers[0]._id,
      activity: reading._id,
      type: "CLASS",
      classroom: classrooms[0]._id,
      images: [activityImageFor(reading.title)].filter(Boolean),
    },
    {
      content: "[Seed] Block towers and pretend shops filled the classroom during free play this afternoon.",
      author: teachers[1]?._id || teachers[0]._id,
      activity: playing._id,
      type: "CLASS",
      classroom: classrooms[1]?._id || classrooms[0]._id,
      images: [activityImageFor(playing.title)].filter(Boolean),
    },
    {
      content: "[Seed] Lunch today was veggie pasta with fresh fruit — the children tried something new and loved it.",
      author: teachers[0]._id,
      activity: eating._id,
      type: "CLASS",
      classroom: classrooms[0]._id,
      images: [activityImageFor(eating.title)].filter(Boolean),
    },
    {
      content: "[Seed] Sunny recess on the playground — lots of running, climbing, and teamwork games.",
      author: teachers[2]?._id || teachers[0]._id,
      activity: outdoor._id,
      type: "CLASS",
      classroom: classrooms[2]?._id || classrooms[0]._id,
      images: [activityImageFor(outdoor.title)].filter(Boolean),
    },
    {
      content: "[Seed] Painted handprint flowers for our spring bulletin board — messy but colourful!",
      author: teachers[1]?._id || teachers[0]._id,
      activity: arts._id,
      type: "CLASS",
      classroom: classrooms[1]?._id || classrooms[0]._id,
      images: [activityImageFor(arts.title)].filter(Boolean),
    },
    {
      content: "[Seed] Learned a new counting song and kept the beat with tambourines.",
      author: teachers[0]._id,
      activity: music._id,
      type: "CLASS",
      classroom: classrooms[0]._id,
      images: [activityImageFor(music.title)].filter(Boolean),
    },
    {
      content: "[Seed] Built letter shapes with play dough during phonics — great focus today.",
      author: teachers[1]?._id || teachers[0]._id,
      activity: learning._id,
      type: "CHILD",
      children: [children[0]._id],
      images: [activityImageFor(learning.title)].filter(Boolean),
    },
    {
      content: "[Seed] Finished the obstacle course with a big smile — personal best on the balance beam!",
      author: teachers[2]?._id || teachers[0]._id,
      activity: sports._id,
      type: "CHILD",
      children: [children[1]?._id || children[0]._id, children[2]?._id].filter(Boolean),
      images: [activityImageFor(sports.title)].filter(Boolean),
    },
  ];

  for (const item of posts) {
    await Post.create({
      ...item,
      status: "ACTIVE",
      videos: [],
      likes: [],
      loves: [],
    });
    console.log(`Created post: ${item.content.replace("[Seed] ", "").slice(0, 60)}…`);
  }

  console.log(`Seeded ${posts.length} posts.`);
}

async function seedNotifications() {
  for (const item of NOTIFICATIONS) {
    await Notification.create({
      title: item.title,
      content: item.content,
      type: item.type,
      isRead: item.isRead,
      isAdmin: true,
      pushNotification: false,
    });
    console.log(`Created notification: ${item.title} (${item.type})`);
  }

  console.log(`Seeded ${NOTIFICATIONS.length} admin notifications.`);
}

async function seedFeesHomeworkPostsNotifications() {
  if (!process.env.DB) {
    throw new Error("DB is not set in .env");
  }

  const [children, teachers, classrooms, activities] = await Promise.all([
    Children.find().sort({ createdAt: 1 }).limit(20),
    Teacher.find({ status: "ACTIVE" }).sort({ createdAt: 1 }).limit(10),
    Classroom.find().sort({ createdAt: 1 }).limit(10),
    Activity.find({ status: "ACTIVE" }).sort({ createdAt: 1 }),
  ]);

  requireEntities("students", children);
  requireEntities("teachers", teachers);
  requireEntities("classrooms", classrooms);
  requireEntities("activities", activities);

  console.log(
    `Using ${children.length} students, ${teachers.length} teachers, ${classrooms.length} classrooms, ${activities.length} activities.`
  );

  await clearPreviousSeedData();
  await seedFees(children);
  await seedHomework({ teachers, classrooms, children });
  await seedPosts({ teachers, classrooms, children, activities });
  await seedNotifications();

  console.log("Done — fees, homework, posts, and notifications seeded.");
}

module.exports = { seedFeesHomeworkPostsNotifications };

if (require.main === module) {
  const { runStandalone } = require("../Helpers/seedConnection");
  runStandalone(seedFeesHomeworkPostsNotifications).catch((error) => {
    console.error("Failed to seed fees/homework/posts/notifications:", error.message);
    process.exit(1);
  });
}
