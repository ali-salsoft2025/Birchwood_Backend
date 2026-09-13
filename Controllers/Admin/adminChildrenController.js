const Children = require("../../Models/Children");
const Classroom = require("../../Models/Classroom");
const Parent = require("../../Models/Parent");
const fs = require("fs");
const mongoose = require("mongoose");
const { ApiResponse, pick } = require("../../Helpers/index");
const { errorHandler } = require("../../Helpers/errorHandler");
const { syncChildParentAssignment } = require("../../Helpers/childParentSync");
const { parseStringList } = require("../../Helpers/childHealth");
const { parseQueryList, parseObjectIdList, inMatch } = require("../../Helpers/queryList");

const HEALTH_LIST_FIELDS = ["allergies", "fears", "conditions", "summary"];

const CHILD_WRITABLE_FIELDS = [
  "rollNumber",
  "term",
  "firstName",
  "lastName",
  "age",
  "birthday",
  "parent",
  "classroom",
  "allergies",
  "fears",
  "conditions",
  "summary",
  "status",
  "image",
];

function buildChildPayload(body) {
  const payload = pick(body, CHILD_WRITABLE_FIELDS);
  if (payload.age !== undefined && payload.age !== "") {
    payload.age = Number(payload.age);
  }
  if (payload.birthday) {
    payload.birthday = new Date(payload.birthday);
  }
  if (payload.parent === "" || payload.parent === "null") payload.parent = null;
  if (payload.classroom === "" || payload.classroom === "null") payload.classroom = null;
  HEALTH_LIST_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      payload[field] = parseStringList(body[field]);
    }
  });
  return payload;
}

function listAggregate(req) {
  const { keyword, parent, classroom, status, sort } = req.query;
  const pipeline = [{ $sort: { createdAt: sort === "oldest" ? 1 : -1 } }];

  const match = {};
  const statuses = parseQueryList(status);
  const parentIds = parseObjectIdList(parent);
  const classroomIds = parseObjectIdList(classroom);
  Object.assign(match, inMatch("status", statuses) || {});
  Object.assign(match, inMatch("parent", parentIds) || {});
  Object.assign(match, inMatch("classroom", classroomIds) || {});
  if (Object.keys(match).length) pipeline.push({ $match: match });

  if (keyword) {
    const regex = new RegExp(keyword, "i");
    pipeline.push({
      $match: {
        $or: [
          { firstName: regex },
          { lastName: regex },
          { rollNumber: regex },
          { term: regex },
        ],
      },
    });
  }

  pipeline.push(
    {
      $lookup: {
        from: "classrooms",
        localField: "classroom",
        foreignField: "_id",
        as: "classroomInfo",
      },
    },
    {
      $lookup: {
        from: "parents",
        localField: "parent",
        foreignField: "_id",
        as: "parentInfo",
      },
    },
    {
      $addFields: {
        classroom: {
          $cond: [
            { $gt: [{ $size: "$classroomInfo" }, 0] },
            {
              _id: { $arrayElemAt: ["$classroomInfo._id", 0] },
              classroomName: { $arrayElemAt: ["$classroomInfo.classroomName", 0] },
              classroomId: { $arrayElemAt: ["$classroomInfo.classroomId", 0] },
              classroomGrade: { $arrayElemAt: ["$classroomInfo.classroomGrade", 0] },
              color: { $arrayElemAt: ["$classroomInfo.color", 0] },
            },
            null,
          ],
        },
        parent: {
          $cond: [
            { $gt: [{ $size: "$parentInfo" }, 0] },
            {
              _id: { $arrayElemAt: ["$parentInfo._id", 0] },
              fatherFirstName: { $arrayElemAt: ["$parentInfo.fatherFirstName", 0] },
              fatherLastName: { $arrayElemAt: ["$parentInfo.fatherLastName", 0] },
              motherFirstName: { $arrayElemAt: ["$parentInfo.motherFirstName", 0] },
              motherLastName: { $arrayElemAt: ["$parentInfo.motherLastName", 0] },
              email: { $arrayElemAt: ["$parentInfo.email", 0] },
              image: { $arrayElemAt: ["$parentInfo.image", 0] },
            },
            null,
          ],
        },
      },
    },
    { $project: { classroomInfo: 0, parentInfo: 0 } }
  );

  return pipeline;
}

exports.addChild = async (req, res) => {
  try {
    const payload = buildChildPayload(req.body);
    const existing = await Children.findOne({ rollNumber: payload.rollNumber });
    if (existing) {
      return res.json(ApiResponse({}, "A student with this roll number already exists", false));
    }

    const child = new Children(payload);
    await child.save();

    if (child.parent) {
      await syncChildParentAssignment(child._id, child.parent, null);
    }

    return res.status(200).json(ApiResponse({ child }, "Student created successfully", true));
  } catch (error) {
    return res.json(ApiResponse({}, errorHandler(error) || error.message, false));
  }
};

exports.searchParents = async (req, res) => {
  try {
    const { keyword } = req.query;
    const filter = {};
    if (keyword) {
      filter.$or = [
        { fatherFirstName: { $regex: keyword, $options: "i" } },
        { fatherLastName: { $regex: keyword, $options: "i" } },
        { motherFirstName: { $regex: keyword, $options: "i" } },
        { motherLastName: { $regex: keyword, $options: "i" } },
        { email: { $regex: keyword, $options: "i" } },
      ];
    }
    const parents = await Parent.find(filter)
      .select("_id fatherFirstName fatherLastName motherFirstName motherLastName email phone status")
      .limit(keyword ? 50 : 20)
      .sort({ createdAt: -1 });
    return res.json(ApiResponse({ parents }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getAllChildren = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    const aggregate = Children.aggregate(listAggregate(req));
    const children = await Children.aggregatePaginate(aggregate, { page, limit });
    return res.json(ApiResponse(children));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getChildById = async (req, res) => {
  try {
    const child = await Children.findById(req.params.id)
      .populate("parent", "fatherFirstName fatherLastName motherFirstName motherLastName email phone image parentId status")
      .populate("classroom", "classroomName classroomId classroomGrade color status")
      .lean();

    if (!child) {
      return res.json(ApiResponse({}, "Student not found", false));
    }

    return res.json(ApiResponse({ child }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getChildrenByClassroom = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    const classroom = await Classroom.findById(req.params.id);
    if (!classroom) {
      return res.json(ApiResponse({}, "Classroom not found", false));
    }

    req.query.classroom = req.params.id;
    const aggregate = Children.aggregate(listAggregate(req));
    const children = await Children.aggregatePaginate(aggregate, { page, limit });
    return res.json(ApiResponse(children));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.updateChild = async (req, res) => {
  try {
    const childId = req.params.id || req.body.id || req.body._id;
    const previous = await Children.findById(childId);
    if (!previous) {
      return res.json(ApiResponse({}, "No student found", false));
    }

    if (req.body.image) {
      if (previous.image) {
        const filePath = `./Uploads/${previous.image}`;
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    }

    const payload = buildChildPayload(req.body);
    if (
      payload.rollNumber &&
      payload.rollNumber !== previous.rollNumber
    ) {
      const duplicate = await Children.findOne({
        rollNumber: payload.rollNumber,
        _id: { $ne: childId },
      });
      if (duplicate) {
        return res.json(ApiResponse({}, "A student with this roll number already exists", false));
      }
    }

    const hasParentField = Object.prototype.hasOwnProperty.call(req.body, "parent");
    const hasClassroomField = Object.prototype.hasOwnProperty.call(req.body, "classroom");
    if (hasParentField) {
      payload.parent = req.body.parent || null;
    } else {
      delete payload.parent;
    }
    if (hasClassroomField) {
      payload.classroom = req.body.classroom || null;
    } else {
      delete payload.classroom;
    }

    const child = await Children.findByIdAndUpdate(childId, payload, { new: true });
    if (hasParentField) {
      await syncChildParentAssignment(child._id, child.parent, previous.parent);
    }

    return res.json(ApiResponse({ child }, "Student updated successfully", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.toggleStatus = async (req, res) => {
  try {
    const child = await Children.findById(req.params.id);
    if (!child) {
      return res.json(ApiResponse({}, "Student not found", false));
    }
    child.status = child.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    await child.save();
    return res.json(ApiResponse({ child }, "Student status changed", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.deleteChild = async (req, res) => {
  try {
    const child = await Children.findById(req.params.id);
    if (!child) {
      return res.json(ApiResponse({}, "Student not found", false));
    }

    if (child.parent) {
      await syncChildParentAssignment(child._id, null, child.parent);
    }

    await Children.findByIdAndDelete(child._id);

    if (child.image) {
      const filePath = `./Uploads/${child.image}`;
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    return res.json(ApiResponse({}, "Student deleted successfully", true));
  } catch (error) {
    return res.json(ApiResponse({}, errorHandler(error) || error.message, false));
  }
};
