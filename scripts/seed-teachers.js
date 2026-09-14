require("../config/loadEnv");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Teacher = require("../Models/Teacher");
const Classroom = require("../Models/Classroom");

const DEFAULT_PASSWORD = process.env.TEACHER_SEED_PASSWORD || "Teacher@12345";
const UPLOAD_DIR = path.join(__dirname, "..", "Uploads");
const { syncTeacherClassroomAssignments } = require("../Helpers/classroomTeacherAssignment");
const { TEACHER_CLASSROOM_ASSIGNMENTS } = require("../constants/teacherClassroomAssignments");
const { seedEntityId } = require("../Helpers/seedIds");

const TEACHERS = [
  {
    firstName: "Samantha",
    lastName: "William",
    email: "samantha.william@birchwood.local",
    phone: "5550101234",
    homeNumber: "5552101234",
    city: "Jakarta",
    state: "DKI Jakarta",
    zip: "12190",
    address: "Jl. Sudirman No. 12, Setiabudi",
    status: "ACTIVE",
    createdAt: "2024-03-21",
    classroomId: "NUR-A",
    photo: "https://randomuser.me/api/portraits/women/44.jpg",
    bio: "Samantha is a History teacher who makes the past feel close to students. She designs museum-style lessons, debate circles, and source analysis for Nursery A at Birchwood.",
    education: [
      { school: "University Akademi Historia", subject: ["History Major", "World History"], start: "2013-08-01", end: "2017-06-30" },
      { school: "University Akademi Historia", subject: ["Master of History", "Philosophy"], start: "2017-08-01", end: "2020-06-30" },
    ],
    employment: [
      { school: "Greenfield Junior School", address: "Jakarta", position: "Social Studies Teacher", start: "2020-08-01", end: "2023-06-30" },
      { school: "Birchwood Academy", address: "Jakarta", position: "History Teacher", start: "2023-07-01", end: null },
    ],
  },
  {
    firstName: "Tony",
    lastName: "Soap",
    email: "tony.soap@birchwood.local",
    phone: "5550102345",
    homeNumber: "5552102345",
    city: "Jakarta",
    state: "DKI Jakarta",
    zip: "10310",
    address: "Jl. Menteng Raya No. 8",
    status: "ACTIVE",
    createdAt: "2024-03-18",
    classroomId: "KG-A",
    photo: "https://randomuser.me/api/portraits/men/32.jpg",
    bio: "Tony teaches Mathematics with a calm, practical style. He uses games, visual models, and weekly clinics so every student in Kindergarten A can build confidence with numbers.",
    education: [
      { school: "University of Indonesia", subject: ["Mathematics", "Statistics"], start: "2012-08-01", end: "2016-07-31" },
      { school: "Bandung Institute of Technology", subject: ["Applied Mathematics"], start: "2016-09-01", end: "2018-08-31" },
    ],
    employment: [
      { school: "Horizon Primary", address: "Jakarta", position: "Math Teacher", start: "2018-08-01", end: "2022-06-30" },
      { school: "Birchwood Academy", address: "Jakarta", position: "Mathematics Teacher", start: "2022-07-01", end: null },
    ],
  },
  {
    firstName: "Nadila",
    lastName: "Adja",
    email: "nadila.adja@birchwood.local",
    phone: "5550103456",
    homeNumber: "5552103456",
    city: "Jakarta",
    state: "DKI Jakarta",
    zip: "12560",
    address: "Jl. Fatmawati No. 21",
    status: "PENDING",
    createdAt: "2024-02-14",
    classroomId: "VI-A",
    photo: "https://randomuser.me/api/portraits/women/68.jpg",
    bio: "Nadila is an English teacher focused on reading for pleasure and clear writing. She runs book clubs and performance poetry with Grade VI A while her onboarding at Birchwood is completed.",
    education: [
      { school: "Atma Jaya University", subject: ["English Literature"], start: "2014-08-01", end: "2018-07-31" },
      { school: "University of York", subject: ["TESOL", "Creative Writing"], start: "2019-09-01", end: "2020-09-30" },
    ],
    employment: [
      { school: "Language House Jakarta", address: "Jakarta", position: "English Instructor", start: "2020-10-01", end: "2024-01-31" },
    ],
  },
  {
    firstName: "Jordan",
    lastName: "Nico",
    email: "jordan.nico@birchwood.local",
    phone: "5550104567",
    homeNumber: "5552104567",
    city: "Jakarta",
    state: "DKI Jakarta",
    zip: "11480",
    address: "Jl. Palmerah Barat No. 5",
    status: "ACTIVE",
    createdAt: "2024-01-26",
    classroomId: "I-A",
    photo: "https://randomuser.me/api/portraits/men/46.jpg",
    bio: "Jordan teaches Science through experiments and outdoor observation. He helps Grade I A students ask better questions and keep careful lab notes.",
    education: [
      { school: "IPB University", subject: ["Biology", "Environmental Science"], start: "2011-08-01", end: "2015-07-31" },
      { school: "University of Melbourne", subject: ["Science Education"], start: "2016-02-01", end: "2017-12-15" },
    ],
    employment: [
      { school: "Coral Bay School", address: "Surabaya", position: "Science Teacher", start: "2018-01-15", end: "2023-12-20" },
      { school: "Birchwood Academy", address: "Jakarta", position: "Science Teacher", start: "2024-01-08", end: null },
    ],
  },
  {
    firstName: "Karen",
    lastName: "Hope",
    email: "karen.hope@birchwood.local",
    phone: "5550105678",
    homeNumber: "5552105678",
    city: "Jakarta",
    state: "DKI Jakarta",
    zip: "12950",
    address: "Jl. Rasuna Said No. 44",
    status: "INACTIVE",
    createdAt: "2023-12-02",
    classroomId: "VII-C",
    photo: "https://randomuser.me/api/portraits/women/21.jpg",
    bio: "Karen taught Art and Culture with a studio-first approach. She is currently on leave and remains homeroom teacher for Grade VII C.",
    education: [
      { school: "Jakarta Institute of Arts", subject: ["Fine Arts", "Culture"], start: "2009-08-01", end: "2013-07-31" },
      { school: "Lasalle College of the Arts", subject: ["Art Education"], start: "2014-01-10", end: "2015-12-20" },
    ],
    employment: [
      { school: "Canvas Academy", address: "Singapore", position: "Art Teacher", start: "2016-01-05", end: "2021-06-30" },
      { school: "Birchwood Academy", address: "Jakarta", position: "Art Teacher", start: "2021-07-15", end: "2024-04-30" },
    ],
  },
  {
    firstName: "Johnny",
    lastName: "Ahmad",
    email: "johnny.ahmad@birchwood.local",
    phone: "5550106789",
    homeNumber: "5552106789",
    city: "Bandung",
    state: "West Java",
    zip: "40115",
    address: "Jl. Dago No. 77",
    status: "ACTIVE",
    createdAt: "2023-11-15",
    classroomId: "IV-A",
    photo: "https://randomuser.me/api/portraits/men/75.jpg",
    bio: "Johnny leads Physical Education for Grade IV A with an emphasis on teamwork, fair play, and healthy habits. He also coaches after-school football.",
    education: [
      { school: "Universitas Pendidikan Indonesia", subject: ["Physical Education", "Sports Science"], start: "2010-08-01", end: "2014-07-31" },
    ],
    employment: [
      { school: "Bandung Sports Club", address: "Bandung", position: "Youth Coach", start: "2014-08-01", end: "2019-06-30" },
      { school: "Birchwood Academy", address: "Jakarta", position: "PE Teacher", start: "2019-07-15", end: null },
    ],
  },
  {
    firstName: "Aisha",
    lastName: "Rahman",
    email: "aisha.rahman@birchwood.local",
    phone: "5550107890",
    homeNumber: "5552107890",
    city: "Surabaya",
    state: "East Java",
    zip: "60241",
    address: "Jl. Darmo No. 19",
    status: "PENDING",
    createdAt: "2023-10-08",
    classroomId: "VII-A",
    photo: "https://randomuser.me/api/portraits/women/33.jpg",
    bio: "Aisha specializes in Music and choir direction. She is pending final documentation and already plans an ensemble program for Grade VII A.",
    education: [
      { school: "Institut Seni Indonesia Yogyakarta", subject: ["Music Performance", "Piano"], start: "2013-08-01", end: "2017-07-31" },
      { school: "Royal College of Music", subject: ["Music Education"], start: "2018-09-01", end: "2019-07-31" },
    ],
    employment: [
      { school: "Surabaya Conservatory", address: "Surabaya", position: "Piano Tutor", start: "2019-08-15", end: "2023-09-30" },
    ],
  },
  {
    firstName: "Daniel",
    lastName: "Park",
    email: "daniel.park@birchwood.local",
    phone: "5550108901",
    homeNumber: "5552108901",
    city: "Jakarta",
    state: "DKI Jakarta",
    zip: "10110",
    address: "Jl. Kebon Sirih No. 3",
    status: "ACTIVE",
    createdAt: "2023-09-19",
    classroomId: "II-A",
    photo: "https://randomuser.me/api/portraits/men/22.jpg",
    bio: "Daniel teaches Computer Science and digital citizenship. Students in Grade II A learn coding, problem solving, and how to use technology kindly and safely.",
    education: [
      { school: "KAIST", subject: ["Computer Science"], start: "2011-03-01", end: "2015-02-20" },
      { school: "Nanyang Technological University", subject: ["Education Technology"], start: "2016-08-01", end: "2017-07-31" },
    ],
    employment: [
      { school: "Seoul Coding Lab", address: "Seoul", position: "Instructor", start: "2017-09-01", end: "2021-06-30" },
      { school: "Birchwood Academy", address: "Jakarta", position: "Computer Science Teacher", start: "2021-08-01", end: null },
    ],
  },
  {
    firstName: "Maria",
    lastName: "Santos",
    email: "maria.santos@birchwood.local",
    phone: "5550109012",
    homeNumber: "5552109012",
    city: "Medan",
    state: "North Sumatra",
    zip: "20111",
    address: "Jl. Imam Bonjol No. 16",
    status: "ACTIVE",
    createdAt: "2023-08-04",
    classroomId: "III-A",
    photo: "https://randomuser.me/api/portraits/women/12.jpg",
    bio: "Maria is a Bahasa Indonesia and literature teacher. She weaves local stories, journalism projects, and public speaking into Grade III A language lessons.",
    education: [
      { school: "Universitas Sumatera Utara", subject: ["Indonesian Literature"], start: "2010-08-01", end: "2014-07-31" },
      { school: "Universitas Gadjah Mada", subject: ["Language Education"], start: "2015-08-01", end: "2017-06-30" },
    ],
    employment: [
      { school: "Medan Heritage School", address: "Medan", position: "Language Teacher", start: "2017-07-15", end: "2023-06-30" },
      { school: "Birchwood Academy", address: "Jakarta", position: "Bahasa Indonesia Teacher", start: "2023-07-10", end: null },
    ],
  },
  {
    firstName: "Omar",
    lastName: "Hassan",
    email: "omar.hassan@birchwood.local",
    phone: "5550110123",
    homeNumber: "5552110123",
    city: "Jakarta",
    state: "DKI Jakarta",
    zip: "14440",
    address: "Jl. Kelapa Gading Boulevard No. 9",
    status: "INACTIVE",
    createdAt: "2023-07-22",
    classroomId: "VIII-A",
    photo: "https://randomuser.me/api/portraits/men/11.jpg",
    bio: "Omar taught Geography and global studies. He is inactive this term and remains homeroom teacher for Grade VIII A.",
    education: [
      { school: "American University in Cairo", subject: ["Geography", "Urban Studies"], start: "2008-09-01", end: "2012-06-30" },
      { school: "London School of Economics", subject: ["Development Studies"], start: "2013-09-01", end: "2014-09-30" },
    ],
    employment: [
      { school: "Cairo International School", address: "Cairo", position: "Geography Teacher", start: "2015-01-10", end: "2021-07-31" },
      { school: "Birchwood Academy", address: "Jakarta", position: "Geography Teacher", start: "2021-08-20", end: "2024-03-31" },
    ],
  },
  {
    firstName: "Emily",
    lastName: "Chen",
    email: "emily.chen@birchwood.local",
    phone: "5550111234",
    homeNumber: "5552111234",
    city: "Jakarta",
    state: "DKI Jakarta",
    zip: "12220",
    address: "Jl. Pondok Indah No. 30",
    status: "ACTIVE",
    createdAt: "2023-06-11",
    classroomId: "V-A",
    photo: "https://randomuser.me/api/portraits/women/47.jpg",
    bio: "Emily teaches Mandarin with songs, storytelling, and conversation circles. She helps Grade V A students speak with confidence and curiosity about culture.",
    education: [
      { school: "National Taiwan Normal University", subject: ["Mandarin", "Teaching Chinese as a Second Language"], start: "2012-09-01", end: "2016-06-30" },
      { school: "University of Hong Kong", subject: ["Applied Linguistics"], start: "2016-09-01", end: "2018-06-30" },
    ],
    employment: [
      { school: "Taipei Language Centre", address: "Taipei", position: "Mandarin Instructor", start: "2018-08-01", end: "2022-05-31" },
      { school: "Birchwood Academy", address: "Jakarta", position: "Mandarin Teacher", start: "2022-07-01", end: null },
    ],
  },
  {
    firstName: "Luis",
    lastName: "Garcia",
    email: "luis.garcia@birchwood.local",
    phone: "5550112345",
    homeNumber: "5552112345",
    city: "Bali",
    state: "Bali",
    zip: "80361",
    address: "Jl. Raya Ubud No. 18",
    status: "PENDING",
    createdAt: "2023-05-03",
    classroomId: "VII-B",
    photo: "https://randomuser.me/api/portraits/men/83.jpg",
    bio: "Luis is joining Birchwood as a Visual Arts teacher for Grade VII B. He brings mural projects and design thinking from studios in Bali and is pending final HR clearance.",
    education: [
      { school: "University of the Philippines Diliman", subject: ["Fine Arts", "Visual Communication"], start: "2011-06-01", end: "2015-04-30" },
      { school: "Rhode Island School of Design", subject: ["Art Education"], start: "2016-09-01", end: "2018-05-31" },
    ],
    employment: [
      { school: "Ubud Creative Studio", address: "Bali", position: "Studio Mentor", start: "2018-07-01", end: "2024-04-30" },
    ],
  },
];

function toEducation(list = []) {
  return list.map((item) => ({
    school: item.school,
    subject: item.subject,
    start: item.start ? new Date(item.start) : undefined,
    end: item.end ? new Date(item.end) : undefined,
  }));
}

function toEmployment(list = []) {
  return list.map((item) => ({
    school: item.school,
    address: item.address,
    position: item.position,
    start: item.start ? new Date(item.start) : undefined,
    end: item.end ? new Date(item.end) : undefined,
  }));
}

async function downloadPortrait(url, filename) {
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  const dest = path.join(UPLOAD_DIR, filename);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not download ${url} (${res.status})`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(dest, buffer);
  return filename;
}

async function seedTeachers() {
  if (!process.env.DB) {
    throw new Error("DB is not set in .env");
  }

  for (let index = 0; index < TEACHERS.length; index += 1) {
    const item = TEACHERS[index];
    const teacherId = seedEntityId("T", index + 1);
    const imageName = `seed-${item.firstName.toLowerCase()}-${item.lastName.toLowerCase()}.jpg`;
    try {
      await downloadPortrait(item.photo, imageName);
      console.log(`Photo saved: ${imageName}`);
    } catch (error) {
      console.log(`Photo skipped for ${item.email}: ${error.message}`);
    }

    let classroomRef;
    if (item.classroomId) {
      const classroom = await Classroom.findOne({ classroomId: item.classroomId }).select("_id");
      if (!classroom) {
        throw new Error(`Classroom ${item.classroomId} is missing. Run npm run seed:classrooms first.`);
      }
      classroomRef = classroom._id;
    }

    const payload = {
      teacherId,
      firstName: item.firstName,
      lastName: item.lastName,
      email: item.email.toLowerCase(),
      phone: item.phone,
      homeNumber: item.homeNumber,
      city: item.city,
      state: item.state,
      zip: item.zip,
      address: item.address,
      status: item.status,
      bio: item.bio,
      education: toEducation(item.education),
      employment: toEmployment(item.employment),
      image: imageName,
      createdAt: new Date(item.createdAt),
    };

    if (classroomRef) {
      payload.classroom = classroomRef;
    }

    let teacher = await Teacher.findOne({ email: payload.email });

    if (teacher) {
      teacher.set(payload);
      if (!classroomRef) {
        teacher.classroom = undefined;
      }
      teacher.password = DEFAULT_PASSWORD;
      teacher.markModified("education");
      teacher.markModified("employment");
      await teacher.save();
      console.log(`Updated teacher: ${payload.email}`);
    } else {
      teacher = new Teacher({
        ...payload,
        password: DEFAULT_PASSWORD,
      });
      await teacher.save();
      console.log(`Created teacher: ${payload.email}`);
    }
  }

  const linked = await syncTeacherClassroomAssignments(TEACHER_CLASSROOM_ASSIGNMENTS);
  console.log(`Synced ${linked} homeroom assignments.`);

  console.log(`Seeded ${TEACHERS.length} teachers with bios, education, and photos.`);
  console.log("\nTeacher login credentials (shared password):");
  TEACHERS.forEach((item) => {
    console.log(`  ${item.firstName} ${item.lastName}  |  ${item.email.toLowerCase()}  |  ${DEFAULT_PASSWORD}  |  ${item.status}`);
  });
  console.log(`\nPassword for all teachers: ${DEFAULT_PASSWORD}`);
}

module.exports = { seedTeachers, TEACHERS };

if (require.main === module) {
  const { runStandalone } = require("../Helpers/seedConnection");
  runStandalone(seedTeachers)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Failed to seed teachers:", err.message);
      process.exit(1);
    });
}
