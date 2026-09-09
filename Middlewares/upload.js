const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { ApiResponse } = require("../Helpers");

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp", "image/svg+xml"];
const VIDEO_TYPES = [
  "video/mp4",
  "video/mpeg",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-flv",
  "video/x-matroska",
  "video/webm",
];

const uniqueName = (originalname) =>
  `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${path.extname(originalname)}`;

const imageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "Uploads/");
  },
  filename: function (req, file, cb) {
    const filename = uniqueName(file.originalname);
    req.body.image = filename;
    cb(null, filename);
  },
});

const multiStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "Uploads");
  },
  filename: function (req, file, cb) {
    cb(null, uniqueName(file.originalname));
  },
});

const limits = { fileSize: 15 * 1024 * 1024 };

exports.uploadFile = function (req, res, next) {
  const upload = multer({
    storage: imageStorage,
    limits,
    fileFilter: (req, file, cb) => {
      if (IMAGE_TYPES.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Image File Type not Allowed"), false);
      }
    },
  }).single("image");

  upload(req, res, function (err) {
    if (err) {
      return res.json(ApiResponse({}, err.message, false));
    }
    next();
  });
};

const wrapUpload = (uploader) => (req, res, next) => {
  uploader(req, res, (err) => {
    if (err) {
      return res.json(ApiResponse({}, err.message, false));
    }
    next();
  });
};

const uploadMultiple = multer({
  storage: multiStorage,
  limits,
  fileFilter: (req, file, cb) => {
    if (IMAGE_TYPES.includes(file.mimetype) || VIDEO_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("File type not allowed"), false);
    }
  },
});

exports.uploadMultiple = wrapUpload(
  uploadMultiple.fields([
    { name: "image", maxCount: 10 },
    { name: "video", maxCount: 10 },
  ])
);

const uploadProduct = multer({
  storage: multiStorage,
  limits,
  fileFilter: (req, file, cb) => {
    if (IMAGE_TYPES.includes(file.mimetype) || VIDEO_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("File type not allowed"), false);
    }
  },
});

exports.uploadProduct = wrapUpload(
  uploadProduct.fields([
    { name: "image", maxCount: 1 },
    { name: "gallery", maxCount: 10 },
  ])
);

const parentImageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "Uploads/");
  },
  filename: function (req, file, cb) {
    const filename = uniqueName(file.originalname);
    req.body[file.fieldname] = filename;
    cb(null, filename);
  },
});

const parentImageUpload = multer({
  storage: parentImageStorage,
  limits,
  fileFilter: (req, file, cb) => {
    if (IMAGE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Image File Type not Allowed"), false);
    }
  },
});

/** Optional father/mother (and legacy image) photos. Skips non-multipart JSON bodies. */
exports.uploadParentImages = wrapUpload(
  parentImageUpload.fields([
    { name: "fatherImage", maxCount: 1 },
    { name: "motherImage", maxCount: 1 },
    { name: "image", maxCount: 1 },
  ])
);
