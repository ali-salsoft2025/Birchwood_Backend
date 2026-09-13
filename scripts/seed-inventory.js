require("../config/loadEnv");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Category = require("../Models/Category");
const Inventory = require("../Models/Inventory");

const UPLOAD_DIR = path.join(__dirname, "..", "Uploads");

const CATEGORIES = [
  { title: "Stationery", description: "Pens, paper, and classroom supplies." },
  { title: "Sports Equipment", description: "Balls, nets, and PE gear." },
  { title: "Science Lab", description: "Lab tools, kits, and safety items." },
  { title: "IT & Electronics", description: "Devices, cables, and accessories." },
  { title: "Furniture", description: "Desks, chairs, and storage." },
];

const INVENTORY = [
  {
    sku: "I000001",
    title: "HB Pencil Pack",
    description: "Box of 24 hexagonal HB pencils for primary grades.",
    quantity: 120,
    manufacturer: "PaperMate",
    unitPrice: 8500,
    notes: "Stored in stationery cupboard A.",
    storageLocation: "Stationery cupboard A",
    category: "Stationery",
    imageUrl: "https://images.pexels.com/photos/256514/pexels-photo-256514.jpeg?auto=compress&w=640&h=480",
  },
  {
    sku: "I000002",
    title: "A4 Copy Paper",
    description: "500-sheet ream, 80gsm white copy paper.",
    quantity: 45,
    manufacturer: "Double A",
    unitPrice: 42000,
    notes: "Reorder when below 20 reams.",
    storageLocation: "Stationery store room",
    issuances: [
      {
        quantity: 15,
        assignedToType: "DEPARTMENT",
        assignedToName: "Admin office",
        issuedDate: new Date("2025-09-01"),
      },
    ],
    category: "Stationery",
    imageUrl: "https://images.pexels.com/photos/159888/pexels-photo-159888.jpeg?auto=compress&w=640&h=480",
  },
  {
    sku: "I000003",
    title: "Whiteboard Markers",
    description: "Assorted color dry-erase markers, low odor.",
    quantity: 60,
    manufacturer: "Pilot",
    unitPrice: 15000,
    category: "Stationery",
    imageUrl: "https://images.pexels.com/photos/1598508/pexels-photo-1598508.jpeg?auto=compress&w=640&h=480",
  },
  {
    sku: "I000004",
    title: "Soccer Ball Size 4",
    description: "Match-quality size 4 football for upper primary.",
    quantity: 18,
    manufacturer: "Mitre",
    unitPrice: 185000,
    storageLocation: "PE equipment shed",
    issuances: [
      {
        quantity: 10,
        assignedToType: "DEPARTMENT",
        assignedToName: "Physical Education",
        issuedDate: new Date("2025-08-15"),
      },
    ],
    category: "Sports Equipment",
    imageUrl: "https://images.pexels.com/photos/1618261/pexels-photo-1618261.jpeg?auto=compress&w=640&h=480",
  },
  {
    sku: "I000005",
    title: "Badminton Set",
    description: "4 rackets with shuttlecocks and carry bag.",
    quantity: 8,
    manufacturer: "Yonex",
    unitPrice: 650000,
    category: "Sports Equipment",
    imageUrl: "https://images.pexels.com/photos/3660548/pexels-photo-3660548.jpeg?auto=compress&w=640&h=480",
  },
  {
    sku: "I000006",
    title: "Volleyball",
    description: "Official weight indoor volleyball.",
    quantity: 12,
    manufacturer: "Mikasa",
    unitPrice: 320000,
    category: "Sports Equipment",
    imageUrl: "https://images.pexels.com/photos/3621104/pexels-photo-3621104.jpeg?auto=compress&w=640&h=480",
  },
  {
    sku: "I000007",
    title: "Microscope Slides",
    description: "Pack of 50 prepared biology slides.",
    quantity: 10,
    manufacturer: "Boreal",
    unitPrice: 275000,
    category: "Science Lab",
    imageUrl: "https://images.pexels.com/photos/2280571/pexels-photo-2280571.jpeg?auto=compress&w=640&h=480",
  },
  {
    sku: "I000008",
    title: "Safety Goggles",
    description: "Adjustable lab goggles for students.",
    quantity: 40,
    manufacturer: "3M",
    unitPrice: 45000,
    category: "Science Lab",
    imageUrl: "https://images.pexels.com/photos/2280549/pexels-photo-2280549.jpeg?auto=compress&w=640&h=480",
  },
  {
    sku: "I000009",
    title: "Chromebook Cart",
    description: "30-bay charging cart for student laptops.",
    quantity: 2,
    manufacturer: "Bretford",
    unitPrice: 12500000,
    notes: "IT room, ground floor.",
    storageLocation: "IT room, ground floor",
    issuances: [
      {
        quantity: 1,
        assignedToType: "DEPARTMENT",
        assignedToName: "IT department",
        issuedDate: new Date("2025-07-01"),
      },
    ],
    category: "IT & Electronics",
    imageUrl: "https://images.pexels.com/photos/7974/pexels-photo.jpg?auto=compress&w=640&h=480",
  },
  {
    sku: "I000010",
    title: "HDMI Cable 2m",
    description: "High-speed HDMI cable for projectors.",
    quantity: 25,
    manufacturer: "Anker",
    unitPrice: 85000,
    category: "IT & Electronics",
    imageUrl: "https://images.pexels.com/photos/1181243/pexels-photo-1181243.jpeg?auto=compress&w=640&h=480",
  },
  {
    sku: "I000011",
    title: "Student Desk",
    description: "Single student desk with book tray.",
    quantity: 30,
    manufacturer: "IndoFurn",
    unitPrice: 950000,
    category: "Furniture",
    imageUrl: "https://images.pexels.com/photos/267506/pexels-photo-267506.jpeg?auto=compress&w=640&h=480",
  },
  {
    sku: "I000012",
    title: "Stackable Chair",
    description: "Ergonomic plastic chair for classrooms.",
    quantity: 35,
    manufacturer: "IndoFurn",
    unitPrice: 420000,
    category: "Furniture",
    imageUrl: "https://images.pexels.com/photos/1957478/pexels-photo-1957478.jpeg?auto=compress&w=640&h=480",
  },
];

async function downloadImage(url, filename) {
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  const dest = path.join(UPLOAD_DIR, filename);
  const res = await fetch(url, {
    headers: {
      "User-Agent": "BirchwoodSeedScript/1.0 (school inventory seeder)",
    },
  });
  if (!res.ok) {
    throw new Error(`Could not download ${url} (${res.status})`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(dest, buffer);
  return filename;
}

async function seedInventory() {
  if (!process.env.DB) {
    throw new Error("DB is not set in .env");
  }

  const categoryMap = {};
  for (let i = 0; i < CATEGORIES.length; i += 1) {
    const item = CATEGORIES[i];
    let category = await Category.findOne({ title: item.title });
    if (category) {
      category.description = item.description;
      category.status = "ACTIVE";
      await category.save();
      console.log(`Updated category: ${item.title}`);
    } else {
      category = await Category.create({
        title: item.title,
        description: item.description,
        status: "ACTIVE",
      });
      console.log(`Created category: ${item.title}`);
    }
    categoryMap[item.title] = category._id;
  }

  const seedSkus = INVENTORY.map((item) => item.sku);
  const removed = await Inventory.deleteMany({ sku: { $in: seedSkus } });
  if (removed.deletedCount) {
    console.log(`Removed ${removed.deletedCount} previously seeded inventory items.`);
  }

  const purchaseDate = new Date("2025-08-01");
  const lastAuditDate = new Date("2026-01-15");

  for (const item of INVENTORY) {
    const imageName = `seed-inventory-${item.sku.toLowerCase()}.jpg`;
    try {
      await downloadImage(item.imageUrl, imageName);
      console.log(`Photo saved: ${imageName}`);
    } catch (error) {
      console.log(`Photo skipped for ${item.sku}: ${error.message}`);
    }

    await Inventory.create({
      sku: item.sku,
      title: item.title,
      description: item.description,
      quantity: item.quantity,
      manufacturer: item.manufacturer,
      purchaseDate,
      unitPrice: item.unitPrice,
      lastAuditDate,
      notes: item.notes || "",
      storageLocation: item.storageLocation || "",
      issuances: item.issuances || [],
      category: categoryMap[item.category],
      gallery: [imageName],
      status: "ACTIVE",
    });
    console.log(`Created ${item.title} (${item.sku})`);
  }

  console.log(`Seeded ${INVENTORY.length} inventory items across ${CATEGORIES.length} categories.`);
}

module.exports = { seedInventory };

if (require.main === module) {
  const { runStandalone } = require("../Helpers/seedConnection");
  runStandalone(seedInventory).catch((error) => {
    console.error("Failed to seed inventory:", error.message);
    process.exit(1);
  });
}
