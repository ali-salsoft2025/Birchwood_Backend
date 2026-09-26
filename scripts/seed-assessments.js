require("../config/loadEnv");
const Assessment = require("../Models/Assessment");
const AssessmentMark = require("../Models/AssessmentMark");
const Classroom = require("../Models/Classroom");
const Children = require("../Models/Children");
const { runStandalone } = require("../Helpers/seedConnection");

const SAMPLES = [
  {
    classroomId: "I-A",
    title: "Spelling quiz — Week 3",
    kind: "QUIZ",
    subject: "English",
    maxMarks: 20,
    notes: "20 words from the weekly list",
    status: "PUBLISHED",
  },
  {
    classroomId: "I-A",
    title: "Number bonds test",
    kind: "TEST",
    subject: "Mathematics",
    maxMarks: 50,
    notes: "Mental maths to 20",
    status: "PUBLISHED",
  },
  {
    classroomId: "II-A",
    title: "Science chapter check",
    kind: "TEST",
    subject: "Science",
    maxMarks: 40,
    notes: "Living things — short answers",
    status: "PUBLISHED",
  },
  {
    classroomId: "III-A",
    title: "Midterm reading exam",
    kind: "EXAM",
    subject: "English",
    maxMarks: 100,
    notes: "Comprehension + vocabulary",
    status: "PUBLISHED",
  },
  {
    classroomId: "IV-A",
    title: "Project: water cycle poster",
    kind: "ASSIGNMENT",
    subject: "Science",
    maxMarks: 30,
    notes: "Marked on accuracy and presentation",
    status: "DRAFT",
  },
];

function scoreFor(index, maxMarks, total) {
  const ratio = 0.55 + ((index % Math.max(total, 1)) / Math.max(total, 1)) * 0.4;
  return Math.min(maxMarks, Math.round(maxMarks * ratio));
}

async function seed() {
  let created = 0;
  let marked = 0;

  for (const sample of SAMPLES) {
    const classroom = await Classroom.findOne({ classroomId: sample.classroomId })
      .select("_id teacher classroomName")
      .lean();
    if (!classroom) {
      console.log(`Skip ${sample.title}: classroom ${sample.classroomId} not found`);
      continue;
    }

    let assessment = await Assessment.findOne({
      title: sample.title,
      classroom: classroom._id,
    });

    if (!assessment) {
      assessment = await Assessment.create({
        title: sample.title,
        kind: sample.kind,
        subject: sample.subject,
        notes: sample.notes,
        classroom: classroom._id,
        maxMarks: sample.maxMarks,
        assessmentDate: new Date(),
        teacher: classroom.teacher || null,
        status: sample.status,
        publishedAt: sample.status === "PUBLISHED" ? new Date() : null,
      });
      created += 1;
      console.log(`Created ${sample.kind}: ${sample.title} (${sample.classroomId})`);
    } else {
      assessment.kind = sample.kind;
      assessment.subject = sample.subject;
      assessment.notes = sample.notes;
      assessment.maxMarks = sample.maxMarks;
      assessment.status = sample.status;
      assessment.publishedAt = sample.status === "PUBLISHED" ? assessment.publishedAt || new Date() : null;
      await assessment.save();
      console.log(`Updated ${sample.kind}: ${sample.title}`);
    }

    const students = await Children.find({
      classroom: classroom._id,
      status: { $ne: "INACTIVE" },
    })
      .select("_id")
      .lean();

    for (let i = 0; i < students.length; i += 1) {
      const obtained = scoreFor(i, sample.maxMarks, students.length);
      await AssessmentMark.findOneAndUpdate(
        { assessment: assessment._id, children: students[i]._id },
        {
          $set: {
            obtained,
            remarks: i % 4 === 0 ? "Good effort" : "",
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      marked += 1;
    }
  }

  console.log(`Done. Assessments created: ${created}. Marks upserted: ${marked}.`);
}

runStandalone(seed).catch((error) => {
  console.error(error);
  process.exit(1);
});
