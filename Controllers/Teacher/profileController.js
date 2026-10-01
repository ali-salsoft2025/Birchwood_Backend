const Teacher = require("../../Models/Teacher");
const { ApiResponse, pick } = require("../../Helpers/index");
const sanitizeUser = require("../../Helpers/sanitizeUser");
const fs = require("fs");
const path = require("path");

const TEACHER_PROFILE_FIELDS = [
  "firstName",
  "lastName",
  "phone",
  "address",
  "city",
  "state",
  "zip",
  "homeNumber",
  "image",
  "bio",
  "education",
  "employment",
];

exports.getProfile = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.user._id).populate("classroom");
    if (!teacher) {
      return res.json(ApiResponse({}, "No Teacher found", false));
    }
    return res
      .status(200)
      .json(ApiResponse(sanitizeUser(teacher), "Found Teacher Details", true));
  } catch (error) {
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const updates = pick(req.body, TEACHER_PROFILE_FIELDS);

    if (updates.image) {
      const currentTeacher = await Teacher.findById(req.user._id);
      if (currentTeacher && currentTeacher.image) {
        const imagePath = path.join("./Uploads", currentTeacher.image);
        if (fs.existsSync(imagePath)) {
          try {
            fs.unlinkSync(imagePath);
          } catch (err) {
            console.error("Error while deleting the previous image:", err);
          }
        }
      }
    }

    const teacher = await Teacher.findByIdAndUpdate(req.user._id, updates, {
      new: true,
    }).populate("classroom");
    if (!teacher) {
      return res.json(ApiResponse({}, "No Teacher found", false));
    }
    return res.json(
      ApiResponse(sanitizeUser(teacher), "Teacher updated successfully")
    );
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.changePassword = async (req, res) => {
  const { old_password, new_password } = req.body;

  try {
    const user = await Teacher.findById(req.user._id);
    if (!user.authenticate(old_password)) {
      return res.json(ApiResponse({}, "Current password is Invalid!", false));
    }

    user.password = new_password;
    await user.save();

    return res
      .status(201)
      .json(ApiResponse({}, "Password Updated Successfully", true));
  } catch (error) {
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};
