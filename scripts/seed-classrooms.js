require("../config/loadEnv");
const mongoose = require("mongoose");
const Classroom = require("../Models/Classroom");
const Teacher = require("../Models/Teacher");
const Children = require("../Models/Children");
const Timetable = require("../Models/TimeTable");
const { CLASSROOM_COLORS } = require("../constants/classroomColors");
const { TEACHER_CLASSROOM_ASSIGNMENTS } = require("../constants/teacherClassroomAssignments");
const { syncTeacherClassroomAssignments } = require("../Helpers/classroomTeacherAssignment");

const CLASSROOMS = [
  {
    classroomId: "NUR-A",
    classroomName: "Nursery A",
    classroomGrade: "Nursery",
    classroomBatch: 2026,
    description: "Play-based mornings for our youngest learners, with circle time, stories, and outdoor exploration.",
    color: "PURPLE",
  },
  {
    classroomId: "KG-A",
    classroomName: "Kindergarten A",
    classroomGrade: "KG",
    classroomBatch: 2026,
    description: "A gentle step into letters, numbers, and classroom routines before Grade I.",
    color: "PINK",
  },
  {
    classroomId: "I-A",
    classroomName: "Grade I A",
    classroomGrade: "I",
    classroomBatch: 2026,
    description: "Foundations in reading, writing, and number sense with plenty of hands-on work.",
    color: "BLUE",
  },
  {
    classroomId: "II-A",
    classroomName: "Grade II A",
    classroomGrade: "II",
    classroomBatch: 2026,
    description: "Building fluency in literacy and maths, plus weekly science and art blocks.",
    color: "GREEN",
  },
  {
    classroomId: "III-A",
    classroomName: "Grade III A",
    classroomGrade: "III",
    classroomBatch: 2026,
    description: "Independent work habits, project weeks, and a stronger focus on inquiry.",
    color: "ORANGE",
  },
  {
    classroomId: "IV-A",
    classroomName: "Grade IV A",
    classroomGrade: "IV",
    classroomBatch: 2026,
    description: "Core subjects with specialist music, PE, and Bahasa Indonesia sessions.",
    color: "CORAL",
  },
  {
    classroomId: "V-A",
    classroomName: "Grade V A",
    classroomGrade: "V",
    classroomBatch: 2026,
    description: "Preparation for upper primary, including research skills and group presentations.",
    color: "YELLOW",
  },
  {
    classroomId: "VI-A",
    classroomName: "Grade VI A",
    classroomGrade: "VI",
    classroomBatch: 2026,
    description: "Capstone primary year with leadership roles and secondary transition support.",
    color: "ROSE",
  },
  {
    classroomId: "VII-A",
    classroomName: "Grade VII A",
    classroomGrade: "VII",
    classroomBatch: 2026,
    description: "Lower secondary homeroom for History, Science, and morning circle.",
    color: "BLUE",
  },
  {
    classroomId: "VII-B",
    classroomName: "Grade VII B",
    classroomGrade: "VII",
    classroomBatch: 2026,
    description: "Lower secondary homeroom with a Mathematics and problem-solving focus.",
    color: "CORAL",
  },
  {
    classroomId: "VII-C",
    classroomName: "Grade VII C",
    classroomGrade: "VII",
    classroomBatch: 2026,
    description: "Lower secondary homeroom for English, reading clubs, and writing workshops.",
    color: "ORANGE",
  },
  {
    classroomId: "VIII-A",
    classroomName: "Grade VIII A",
    classroomGrade: "VIII",
    classroomBatch: 2026,
    description: "Year 8 homeroom covering English literature and specialist subjects.",
    color: "GREEN",
  },
];

async function seedClassrooms() {
  if (!process.env.DB) {
    throw new Error("DB is not set in .env");
  }

  for (const room of CLASSROOMS) {
    if (!CLASSROOM_COLORS.includes(room.color)) {
      throw new Error(`Invalid logo color "${room.color}" for ${room.classroomId}`);
    }
  }

  const oldRooms = await Classroom.find({}).select("_id");
  const oldIds = oldRooms.map((room) => room._id);

  if (oldIds.length) {
    await Timetable.deleteMany({ classroom: { $in: oldIds } });
    await Teacher.updateMany({ classroom: { $in: oldIds } }, { $unset: { classroom: 1 } });
    await Children.updateMany({ classroom: { $in: oldIds } }, { $unset: { classroom: 1 } });
    await Classroom.deleteMany({ _id: { $in: oldIds } });
    console.log(`Removed ${oldIds.length} old classrooms, related timetables, and class assignments.`);
  }

  for (const room of CLASSROOMS) {
    const saved = await Classroom.create({
      classroomId: room.classroomId,
      classroomName: room.classroomName,
      classroomGrade: room.classroomGrade,
      classroomBatch: room.classroomBatch,
      description: room.description,
      color: room.color,
      status: "ACTIVE",
    });
    console.log(`Created ${saved.classroomName} (${saved.classroomId}) · ${saved.color}`);
  }

  console.log(`Seeded ${CLASSROOMS.length} sections with logo colors.`);
}

module.exports = { seedClassrooms, CLASSROOMS };

if (require.main === module) {
  const { runStandalone } = require("../Helpers/seedConnection");
  runStandalone(seedClassrooms)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Failed to seed classrooms:", err.message);
      process.exit(1);
    });
}
