require("../config/loadEnv");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Parent = require("../Models/Parent");
const { seedEntityId } = require("../Helpers/seedIds");

const DEFAULT_PASSWORD = process.env.PARENT_SEED_PASSWORD || "Parent@12345";
const UPLOAD_DIR = path.join(__dirname, "..", "Uploads");

const PARENTS = [
  {
    fatherFirstName: "James",
    fatherLastName: "William",
    motherFirstName: "Helen",
    motherLastName: "William",
    email: "james.william@birchwood.local",
    phone: "5550201234",
    city: "Jakarta",
    state: "DKI Jakarta",
    address: "Jl. Kemang Raya No. 18, Mampang",
    status: "ACTIVE",
    createdAt: "2024-03-21",
    photo: "https://randomuser.me/api/portraits/men/36.jpg",
  },
  {
    fatherFirstName: "Andre",
    fatherLastName: "Santoso",
    motherFirstName: "Dewi",
    motherLastName: "Santoso",
    email: "andre.santoso@birchwood.local",
    phone: "5550202345",
    city: "Jakarta",
    state: "DKI Jakarta",
    address: "Jl. Senopati No. 7, Kebayoran Baru",
    status: "ACTIVE",
    createdAt: "2024-03-18",
    photo: "https://randomuser.me/api/portraits/men/41.jpg",
  },
  {
    fatherFirstName: "Michael",
    fatherLastName: "Tan",
    motherFirstName: "Grace",
    motherLastName: "Tan",
    email: "michael.tan@birchwood.local",
    phone: "5550203456",
    city: "Jakarta",
    state: "DKI Jakarta",
    address: "Jl. Pondok Indah No. 22, Kebayoran Lama",
    status: "ACTIVE",
    createdAt: "2024-02-14",
    photo: "https://randomuser.me/api/portraits/men/52.jpg",
  },
  {
    fatherFirstName: "Rizky",
    fatherLastName: "Pratama",
    motherFirstName: "Sinta",
    motherLastName: "Pratama",
    email: "rizky.pratama@birchwood.local",
    phone: "5550204567",
    city: "Jakarta",
    state: "DKI Jakarta",
    address: "Jl. Bangka Raya No. 11, Mampang Prapatan",
    status: "ACTIVE",
    createdAt: "2024-01-26",
    photo: "https://randomuser.me/api/portraits/men/64.jpg",
  },
  {
    fatherFirstName: "David",
    fatherLastName: "Kurniawan",
    motherFirstName: "Anita",
    motherLastName: "Kurniawan",
    email: "david.kurniawan@birchwood.local",
    phone: "5550205678",
    city: "Tangerang",
    state: "Banten",
    address: "Jl. BSD Boulevard No. 45, Serpong",
    status: "ACTIVE",
    createdAt: "2023-12-02",
    photo: "https://randomuser.me/api/portraits/men/18.jpg",
  },
  {
    fatherFirstName: "Fajar",
    fatherLastName: "Hidayat",
    motherFirstName: "Lestari",
    motherLastName: "Hidayat",
    email: "fajar.hidayat@birchwood.local",
    phone: "5550206789",
    city: "Depok",
    state: "West Java",
    address: "Jl. Margonda Raya No. 88, Pancoran Mas",
    status: "INACTIVE",
    createdAt: "2023-11-15",
    photo: "https://randomuser.me/api/portraits/men/28.jpg",
  },
  {
    fatherFirstName: "Jonathan",
    fatherLastName: "Lee",
    motherFirstName: "Michelle",
    motherLastName: "Lee",
    email: "jonathan.lee@birchwood.local",
    phone: "5550207890",
    city: "Jakarta",
    state: "DKI Jakarta",
    address: "Jl. Kelapa Gading Boulevard No. 3",
    status: "ACTIVE",
    createdAt: "2023-10-08",
    photo: "https://randomuser.me/api/portraits/men/45.jpg",
  },
  {
    fatherFirstName: "Budi",
    fatherLastName: "Wijaya",
    motherFirstName: "Ratna",
    motherLastName: "Wijaya",
    email: "budi.wijaya@birchwood.local",
    phone: "5550208901",
    city: "Bekasi",
    state: "West Java",
    address: "Jl. Ahmad Yani No. 56, Bekasi Selatan",
    status: "ACTIVE",
    createdAt: "2023-09-19",
    photo: "https://randomuser.me/api/portraits/men/57.jpg",
  },
  {
    fatherFirstName: "Arjun",
    fatherLastName: "Mehta",
    motherFirstName: "Priya",
    motherLastName: "Mehta",
    email: "arjun.mehta@birchwood.local",
    phone: "5550209012",
    city: "Jakarta",
    state: "DKI Jakarta",
    address: "Jl. Rasuna Said No. 31, Kuningan",
    status: "ACTIVE",
    createdAt: "2023-08-04",
    photo: "https://randomuser.me/api/portraits/men/12.jpg",
  },
  {
    fatherFirstName: "Hendra",
    fatherLastName: "Gunawan",
    motherFirstName: "Maya",
    motherLastName: "Gunawan",
    email: "hendra.gunawan@birchwood.local",
    phone: "5550210123",
    city: "Bandung",
    state: "West Java",
    address: "Jl. Dago No. 14, Coblong",
    status: "INACTIVE",
    createdAt: "2023-07-22",
    photo: "https://randomuser.me/api/portraits/men/71.jpg",
  },
  {
    fatherFirstName: "Kevin",
    fatherLastName: "Hartono",
    motherFirstName: "Jessica",
    motherLastName: "Hartono",
    email: "kevin.hartono@birchwood.local",
    phone: "5550211234",
    city: "Jakarta",
    state: "DKI Jakarta",
    address: "Jl. Pantai Indah Kapuk No. 9",
    status: "ACTIVE",
    createdAt: "2023-06-11",
    photo: "https://randomuser.me/api/portraits/men/77.jpg",
  },
  {
    fatherFirstName: "Salman",
    fatherLastName: "Farizi",
    motherFirstName: "Amina",
    motherLastName: "Farizi",
    email: "salman.farizi@birchwood.local",
    phone: "5550212345",
    city: "Surabaya",
    state: "East Java",
    address: "Jl. Darmo Permai No. 20",
    status: "ACTIVE",
    createdAt: "2023-05-03",
    photo: "https://randomuser.me/api/portraits/men/85.jpg",
  },
];

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

async function seedParents() {
  if (!process.env.DB) {
    throw new Error("DB is not set in .env");
  }

  await mongoose.connect(process.env.DB);

  for (let index = 0; index < PARENTS.length; index += 1) {
    const item = PARENTS[index];
    const parentId = seedEntityId("P", index + 1);
    const imageName = `seed-parent-${item.fatherFirstName.toLowerCase()}-${item.fatherLastName.toLowerCase()}.jpg`;
    try {
      await downloadPortrait(item.photo, imageName);
      console.log(`Photo saved: ${imageName}`);
    } catch (error) {
      console.log(`Photo skipped for ${item.email}: ${error.message}`);
    }

    const payload = {
      parentId,
      fatherFirstName: item.fatherFirstName,
      fatherLastName: item.fatherLastName,
      motherFirstName: item.motherFirstName,
      motherLastName: item.motherLastName,
      email: item.email.toLowerCase(),
      phone: item.phone,
      city: item.city,
      state: item.state,
      address: item.address,
      status: item.status,
      image: imageName,
      fatherImage: imageName,
      createdAt: new Date(item.createdAt),
    };

    let parent = await Parent.findOne({ email: payload.email });

    if (parent) {
      parent.set(payload);
      await parent.save();
      console.log(`Updated parent: ${payload.email}`);
    } else {
      parent = new Parent({
        ...payload,
        password: DEFAULT_PASSWORD,
        childrens: [],
      });
      await parent.save();
      console.log(`Created parent: ${payload.email}`);
    }
  }

  console.log(`Seeded ${PARENTS.length} parents with details and photos. No children were created.`);
  console.log(`Password: ${DEFAULT_PASSWORD}`);
  await mongoose.disconnect();
}

seedParents()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed to seed parents:", err.message);
    process.exit(1);
  });
