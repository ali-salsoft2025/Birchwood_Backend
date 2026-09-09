//Models
const Children = require("../../Models/Children");
const Parent = require("../../Models/Parent");

const fs = require("fs");
const moment = require("moment");
//Helpers
const { ApiResponse } = require("../../Helpers/index");
const { validateToken } = require("../../Helpers/index");
const { generateString,generateRandom6DigitID } = require("../../Helpers/index");
const { errorHandler } = require("../../Helpers/errorHandler");
const {
  sendNotificationToAdmin,
  sendNotificationToUser,
} = require("../../Helpers/notification");
const sanitizeUser = require("../../Helpers/sanitizeUser");
const {
  createResetToken,
  validateResetToken,
} = require("../../Helpers/verification");
const mongoose = require("mongoose");
const {
  assignParentImagesFromBody,
  replaceParentUploadedImages,
  deleteParentUploadedImages,
} = require("../../Helpers/parentImages");


// Add a new parent
exports.addParent = async (req, res) => {
  const {
    fatherFirstName,
    fatherLastName,
    motherFirstName,
    motherLastName,
    email,
    phone,
    password,
    address,
    city,
    state,
    image,
    fatherImage,
    motherImage,
    zip,
    status,
  } = assignParentImagesFromBody(req.body);

  try {
    let existingParent = await Parent.findOne({ email });

    if (existingParent) {
      return res.json(ApiResponse({}, "Parent with this email already exists", false));
    }

    const parent = new Parent({
      parentId: generateRandom6DigitID("P"),     
      fatherFirstName,
      fatherLastName,
      motherFirstName,
      motherLastName,
      email,
      phone,
      password,
      address,
      city,
      state,
      image,
      fatherImage,
      motherImage,
      zip,
      status: status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    });

    await parent.save();

    return res.status(200).json(ApiResponse({ parent }, "Parent Created Successfully", true));
  } catch (error) {
    return res.json(ApiResponse({}, errorHandler(error) ? errorHandler(error) : error.message, false));
  }
};


//searchStudents
exports.searchStudents = async (req, res) => {
  try {
    const { keyword } = req.query;
    const filter = { status: "ACTIVE" };
    if (keyword) {
      filter.$or = [
        { firstName: { $regex: keyword, $options: "i" } },
        { lastName: { $regex: keyword, $options: "i" } },
        { rollNumber: { $regex: keyword, $options: "i" } },
      ];
    }
    const students = await Children.find(filter)
      .select("_id firstName lastName rollNumber parent status")
      .limit(50)
      .sort({ firstName: 1 });
    return res.json(ApiResponse({ students }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, errorHandler(error) ? errorHandler(error) : error.message, false));
  }
};

exports.getAllParent = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    const { keyword, status, studentId, sort } = req.query;

    let finalAggregate = [
      {
        $sort: {
          createdAt: sort === "oldest" ? 1 : -1,
        },
      },
      {
        $lookup: {
          from: "childrens",
          let: { parentId: "$_id", childIds: { $ifNull: ["$childrens", []] } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ["$parent", "$$parentId"] },
                    { $in: ["$_id", "$$childIds"] },
                  ],
                },
              },
            },
            {
              $project: {
                firstName: 1,
                lastName: 1,
                rollNumber: 1,
                status: 1,
                image: 1,
              },
            },
          ],
          as: "childrens",
        },
      },
    ];

    if (keyword) {
      const regex = new RegExp(keyword, "i");
      finalAggregate.push({
        $match: {
          $or: [
            { fatherFirstName: { $regex: regex } },
            { fatherLastName: { $regex: regex } },
            { motherFirstName: { $regex: regex } },
            { motherLastName: { $regex: regex } },
            { email: { $regex: regex } },
            { parentId: { $regex: regex } },
            { city: { $regex: regex } },
            { "childrens.firstName": { $regex: regex } },
            { "childrens.lastName": { $regex: regex } },
          ],
        },
      });
    }

    if (status) {
      finalAggregate.push({
        $match: { status },
      });
    }

    if (studentId && mongoose.Types.ObjectId.isValid(studentId)) {
      finalAggregate.push({
        $match: {
          "childrens._id": new mongoose.Types.ObjectId(studentId),
        },
      });
    }

    finalAggregate.push({
      $project: {
        hashed_password: 0,
        salt: 0,
      },
    });

    Parent.aggregatePaginate(Parent.aggregate(finalAggregate), { page, limit })
      .then((parents) => {
        res.json(ApiResponse(parents));
      })
      .catch((error) => {
        res.json(ApiResponse({}, error.message, false));
      });
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

// Get parent by ID
function assignedChildFilter(parent) {
  const ids = (parent.childrens || []).filter((id) => mongoose.Types.ObjectId.isValid(id));
  const filters = [{ parent: parent._id }];
  if (ids.length) {
    filters.push({ _id: { $in: ids } });
  }
  return { $or: filters };
}

exports.getParentById = async (req, res) => {
  try {
    const parent = await Parent.findById(req.params.id)
      .select("-hashed_password -salt")
      .lean();

    if (!parent) {
      return res.json(ApiResponse({}, "Parent not found", true));
    }

    const childrens = await Children.find(assignedChildFilter(parent))
      .select("firstName lastName rollNumber image status classroom birthday age")
      .populate("classroom", "classroomName classroomId")
      .sort({ firstName: 1 })
      .lean();

    return res.json(ApiResponse({ parent: { ...parent, childrens } }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

function makeParentPassword() {
  const n = String(Math.floor(10000 + Math.random() * 90000));
  return `Parent@${n}aA`;
}

// Update parent
exports.updateParent = async (req, res) => {
  
  try {
    const currentParent = await Parent.findById(req.params.id);
    if (!currentParent) {
      return res.json(ApiResponse({}, "No parent found", false));
    }

    const { password, ...rawUpdates } = req.body;
    const updates = assignParentImagesFromBody(rawUpdates);
    replaceParentUploadedImages(currentParent, updates);

    let parent = await Parent.findByIdAndUpdate(req.params.id, updates, { new: true });

    if (!parent) {
      return res.json(ApiResponse({}, "No parent found", false));
    }

    return res.json(ApiResponse(parent, "Parent Profile updated successfully"));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

// Toggle parent status
exports.toggleStatus = async (req, res) => {
  try {
    let parent = await Parent.findById(req.params.id);

    parent.status = parent.status == "ACTIVE" ? "INACTIVE" : "ACTIVE";
    await parent.save();

    return res.json(ApiResponse(parent, "Parent Status Changed"));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};


//reset parent password
exports.resetParentPassword = async (req, res) => {
  try {
    const parent = await Parent.findById(req.params.id);
    if (!parent) {
      return res.status(404).json(ApiResponse({}, "Parent not found", false));
    }

    const generated = req.body.password ? null : makeParentPassword();
    const password = req.body.password || generated;
    parent.password = password;
    await parent.save();

    return res.status(201).json(
      ApiResponse(
        { password: generated || undefined },
        "Parent password updated successfully",
        true
      )
    );
  } catch (err) {
    res.status(500).json(ApiResponse({}, err.toString(), false));
  }
};

// Delete a parent
exports.deleteParent = async (req, res) => {
  try {
    const parent = await Parent.findById(req.params.id);

    if (!parent) {
      return res.status(404).json(ApiResponse({}, "Parent Profile not found", false));
    }

    const linkedChildren = await Children.countDocuments(assignedChildFilter(parent));

    if (linkedChildren > 0) {
      return res.status(400).json(
        ApiResponse(
          {},
          "Cannot delete this parent while children are assigned. Reassign or remove the children first.",
          false
        )
      );
    }

    await Parent.findByIdAndDelete(parent._id);

    deleteParentUploadedImages(parent);

    return res.json(ApiResponse({}, "Parent Profile Deleted Successfully", true));
  } catch (error) {
    return res.json(ApiResponse({}, errorHandler(error) ? errorHandler(error) : error.message, false));
  }
};