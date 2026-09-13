require("../config/loadEnv");
const mongoose = require("mongoose");
const Classroom = require("../Models/Classroom");
const Timetable = require("../Models/TimeTable");

const DAYS = ["MON", "TUE", "WED", "THU", "FRI"];

const CLASS_SUBJECTS = {
  "NUR-A": "Play & Circle",
  "KG-A": "Letters & Numbers",
  "I-A": "Literacy",
  "II-A": "Literacy",
  "III-A": "Inquiry",
  "IV-A": "Core Studies",
  "V-A": "Core Studies",
  "VI-A": "Core Studies",
  "VII-A": "History",
  "VII-B": "Mathematics",
  "VII-C": "Science",
  "VIII-A": "English",
};

function periodsFor(classroom) {
  const core = CLASS_SUBJECTS[classroom.classroomId] || "Core Work";
  const classLabel = `Class ${classroom.classroomName}`;

  return [
    {
      startTime: "08:00",
      endTime: "09:00",
      subject: "Morning Circle",
      description: classLabel,
    },
    {
      startTime: "09:00",
      endTime: "10:30",
      subject: core,
      description: classLabel,
    },
    {
      startTime: "10:45",
      endTime: "12:00",
      subject: "Guided Work",
      description: classLabel,
    },
    {
      startTime: "13:00",
      endTime: "14:30",
      subject: "Specials",
      description: classLabel,
    },
  ];
}

async function seedTimetable() {
  if (!process.env.DB) {
    throw new Error("DB is not set in .env");
  }

  const classrooms = await Classroom.find({ status: "ACTIVE" });
  if (!classrooms.length) {
    throw new Error("No classrooms found. Run npm run seed:teachers first.");
  }

  const classroomIds = classrooms.map((room) => room._id);
  await Timetable.deleteMany({ classroom: { $in: classroomIds } });

  const docs = classrooms.flatMap((room) =>
    DAYS.flatMap((day) =>
      periodsFor(room).map((period) => ({
        classroom: room._id,
        day,
        ...period,
      }))
    )
  );

  await Timetable.insertMany(docs);
  console.log(`Seeded ${docs.length} timetable slots for ${classrooms.length} classrooms.`);
}

module.exports = { seedTimetable };

if (require.main === module) {
  const { runStandalone } = require("../Helpers/seedConnection");
  runStandalone(seedTimetable)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Failed to seed timetable:", err.message);
      process.exit(1);
    });
}
