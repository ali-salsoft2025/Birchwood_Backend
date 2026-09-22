const Parent = require("../../Models/Parent");
const Children = require("../../Models/Children");
const moment = require("moment");
const { ApiResponse } = require("../../Helpers/index");
const { syncChildParentAssignment } = require("../../Helpers/childParentSync");
const { unlinkUploadedFile } = require("../../Helpers/uploadFiles");
const { parseStringList } = require("../../Helpers/childHealth");

function commaList(value) {
  if (Array.isArray(value)) {
    return parseStringList(value);
  }
  if (typeof value !== "string") {
    return parseStringList(value);
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function lineList(value) {
  if (Array.isArray(value)) {
    return parseStringList(value);
  }
  if (typeof value !== "string") {
    return parseStringList(value);
  }
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function calendarDay(value) {
  const m = moment(value);
  if (!m.isValid()) {
    return "";
  }
  const utc = moment.utc(value);
  if (utc.hours() === 0 && utc.minutes() === 0 && utc.seconds() === 0) {
    return utc.format("YYYY-MM-DD");
  }
  return m.format("YYYY-MM-DD");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

exports.assignChild = async (req, res) => {
  try {
    const rollNumber = String(
      req.body.rollNumber || req.body.rollNo || "",
    ).trim();
    const birthdayRaw = req.body.birthday || req.body.dob;
    const birthday = moment(
      birthdayRaw,
      [moment.ISO_8601, "YYYY-MM-DD", "DD-MM-YYYY", "DD/MM/YYYY", "D MMM YYYY"],
      true,
    );

    const parent = await Parent.findById(req.user._id);
    if (!parent) {
      return res.status(400).json(ApiResponse({}, "Parent not Found", false));
    }

    const child = await Children.findOne({
      rollNumber: { $regex: `^${escapeRegex(rollNumber)}$`, $options: "i" },
    });
    const birthdayMatches =
      child &&
      child.birthday &&
      birthday.isValid() &&
      calendarDay(birthday) === calendarDay(child.birthday);

    if (!child || !birthdayMatches) {
      return res
        .status(400)
        .json(ApiResponse({}, "Child details do not match", false));
    }

    if (child.parent && String(child.parent) !== String(parent._id)) {
      return res
        .status(400)
        .json(ApiResponse({}, "Child already has a parent assigned", false));
    }

    if (child.parent && String(child.parent) === String(parent._id)) {
      return res
        .status(200)
        .json(ApiResponse({ child }, "Child already linked", true));
    }

    child.parent = parent._id;
    await child.save();
    await syncChildParentAssignment(child._id, parent._id, null);

    const linked = await Children.findById(child._id);
    return res
      .status(200)
      .json(ApiResponse({ child: linked }, "Child assigned successfully", true));
  } catch (error) {
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};

exports.updateChildHealth = async (req, res) => {
  const uploadedName = req.file ? String(req.body.image || req.file.filename || "") : "";
  let saved = false;
  try {
    const childId = req.body.childId || req.body.child || req.params.id;
    const child = await Children.findById(childId);
    if (!child) {
      if (uploadedName) unlinkUploadedFile(uploadedName);
      return res.status(404).json(ApiResponse({}, "Child not found", false));
    }

    if (!child.parent || String(child.parent) !== String(req.user._id)) {
      if (uploadedName) unlinkUploadedFile(uploadedName);
      return res.status(403).json(ApiResponse({}, "This is not your child", false));
    }

    const previousImage = child.image;
    child.allergies = commaList(req.body.allergies);
    child.fears = commaList(req.body.fears);
    child.conditions = commaList(req.body.conditions);
    child.summary = lineList(req.body.summary);
    if (uploadedName) {
      child.image = uploadedName;
    }
    await child.save();
    saved = true;

    if (uploadedName && previousImage && previousImage !== uploadedName) {
      unlinkUploadedFile(previousImage);
    }

    const updated = await Children.findById(child._id).populate({
      path: "classroom",
      populate: { path: "teacher", select: "firstName lastName" },
    });

    return res
      .status(200)
      .json(ApiResponse({ child: updated }, "Student updated", true));
  } catch (error) {
    if (uploadedName && !saved) unlinkUploadedFile(uploadedName);
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};

exports.removeChild = async (req, res) => {
  try {
    const child = await Children.findById(req.body.child);

    if (!child) {
      return res.status(200).json(ApiResponse({}, "Child not Found", true));
    }

    if (!child.parent) {
      return res.status(400).json(ApiResponse({}, "Child does not have a parent assigned", true));
    }

    const parent = await Parent.findById(req.user._id);
    const isChildInParentArray = parent.childrens.includes(child._id);

    if (!isChildInParentArray) {
      return res.status(400).json(ApiResponse({}, "This is not your child", true));
    }

    parent.childrens = parent.childrens.filter(
      (childId) => childId.toString() !== child._id.toString(),
    );
    child.parent = null;

    await parent.save();
    await child.save();

    return res.status(200).json(ApiResponse({}, "Child removed successfully", true));
  } catch (error) {
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};
