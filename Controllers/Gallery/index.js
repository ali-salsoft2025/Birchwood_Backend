const fs = require("fs");
const Gallery = require("../../Models/Gallery");
const { ApiResponse } = require("../../Helpers/index");

function unlinkImage(filename) {
  if (!filename) return;
  const filePath = `./Uploads/${filename}`;
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function newFilenames(files) {
  const list = Array.isArray(files) ? files : [];
  return list.map((file) => file.filename).filter(Boolean);
}

function removedNames(value) {
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.map((name) => String(name)) : [];
  } catch (error) {
    return [];
  }
}

exports.addGallery = async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    const images = newFilenames(req.files);
    if (!title) {
      images.forEach(unlinkImage);
      return res.status(400).json(ApiResponse({}, "Album title is required", false));
    }
    if (!images.length) {
      return res.status(400).json(ApiResponse({}, "Add at least one photo", false));
    }

    const gallery = await Gallery.create({
      title,
      caption: String(req.body.caption || "").trim(),
      images,
      status: req.body.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    });

    return res.status(201).json(ApiResponse({ gallery }, "Album added", true));
  } catch (error) {
    newFilenames(req.files).forEach(unlinkImage);
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};

exports.updateGallery = async (req, res) => {
  try {
    const gallery = await Gallery.findById(req.params.id);
    if (!gallery) {
      newFilenames(req.files).forEach(unlinkImage);
      return res.status(404).json(ApiResponse({}, "Album not found", false));
    }

    const title = String(req.body.title || gallery.title || "").trim();
    if (!title) {
      newFilenames(req.files).forEach(unlinkImage);
      return res.status(400).json(ApiResponse({}, "Album title is required", false));
    }

    const drop = new Set(removedNames(req.body.removedImages));
    const kept = (gallery.images || []).filter((name) => !drop.has(name));
    const added = newFilenames(req.files);
    const images = [...kept, ...added];
    if (!images.length) {
      added.forEach(unlinkImage);
      return res.status(400).json(ApiResponse({}, "An album needs at least one photo", false));
    }

    gallery.title = title;
    gallery.caption = String(req.body.caption ?? gallery.caption ?? "").trim();
    gallery.images = images;
    if (req.body.status === "ACTIVE" || req.body.status === "INACTIVE") {
      gallery.status = req.body.status;
    }
    await gallery.save();
    drop.forEach(unlinkImage);

    return res.json(ApiResponse({ gallery }, "Album updated", true));
  } catch (error) {
    newFilenames(req.files).forEach(unlinkImage);
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};

exports.deleteGallery = async (req, res) => {
  try {
    const gallery = await Gallery.findById(req.params.id);
    if (!gallery) {
      return res.status(404).json(ApiResponse({}, "Album not found", false));
    }
    (gallery.images || []).forEach(unlinkImage);
    await gallery.deleteOne();
    return res.json(ApiResponse({}, "Album deleted", true));
  } catch (error) {
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};

exports.getAllGalleries = async (req, res) => {
  try {
    const galleries = await Gallery.find().sort({ createdAt: -1 });
    res.set("Cache-Control", "no-store");
    return res.json(ApiResponse({ galleries }, "", true));
  } catch (error) {
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};

exports.getActiveGalleries = async (req, res) => {
  try {
    const galleries = await Gallery.find({ status: "ACTIVE" }).sort({ createdAt: -1 });
    res.set("Cache-Control", "no-store");
    return res.json(ApiResponse({ galleries }, "", true));
  } catch (error) {
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};
