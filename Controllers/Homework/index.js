const Homework = require("../../Models/Homework");
const moment = require("moment");
const mongoose = require("mongoose");
const Children = require("../../Models/Children");
const { ApiResponse } = require("../../Helpers/index");
const { errorHandler } = require("../../Helpers/errorHandler");
const { sendNotificationToAdmin } = require("../../Helpers/notification");
const {
  normalizeHomeworkPayload,
  validateHomeworkAssignment,
  notifyHomeworkAssigned,
  homeworkLookupStages,
} = require("../../Helpers/homeworkAssignment");
const {
  assertCanAccessChild,
  assertHomeworkWriteAccess,
  getParentChildIds,
} = require("../../Helpers/accessControl");
const { parseQueryList, parseObjectIdList, pushInMatch } = require("../../Helpers/queryList");

exports.addHomework = async (req, res) => {
  try {
    const payload = await normalizeHomeworkPayload(req.body, req);
    const validationError = await validateHomeworkAssignment(payload, req);

    if (validationError) {
      return res.status(400).json(ApiResponse({}, validationError, false));
    }

    const homework = await Homework.create(payload);

    await notifyHomeworkAssigned(homework);

    if (req.isAdmin) {
      sendNotificationToAdmin(
        "New homework created",
        `${homework.title} was assigned (${homework.assignee === "CLASS" ? "class" : "student"})`,
        "NOTIFICATION"
      );
    }

    return res
      .status(201)
      .json(ApiResponse({ homework }, "Homework created successfully", true));
  } catch (error) {
    return res.json(
      ApiResponse({}, errorHandler(error) ? errorHandler(error) : error.message, false)
    );
  }
};

exports.getAllHomework = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    const { keyword, children, type, assignee, from, to, status } = req.query;

    const finalAggregate = [];

    if (req.userRole === "teacher" && req.user?._id) {
      finalAggregate.push({
        $match: {
          teacher: new mongoose.Types.ObjectId(req.user._id),
        },
      });
    }

    if (req.userRole === "parent") {
      const childIds = await getParentChildIds(req);
      if (!childIds.length) {
        return res.json(
          ApiResponse({ docs: [], totalDocs: 0, totalPages: 0, page: Number(page), limit: Number(limit) })
        );
      }
      const parentChildren = await Children.find({ parent: req.user._id }).select("classroom").lean();
      const classroomIds = [
        ...new Set(parentChildren.map((item) => item.classroom).filter(Boolean).map(String)),
      ].map((id) => new mongoose.Types.ObjectId(id));
      finalAggregate.push({
        $match: {
          $or: [
            { assignee: "CHILD", children: { $in: childIds } },
            ...(classroomIds.length ? [{ assignee: "CLASS", classroom: { $in: classroomIds } }] : []),
          ],
        },
      });
    }

    finalAggregate.push({ $sort: { assignDate: -1 } });

    if (keyword) {
      const regex = new RegExp(String(keyword).trim(), "i");
      finalAggregate.push({
        $match: {
          $or: [{ title: { $regex: regex } }, { description: { $regex: regex } }],
        },
      });
    }

    if (children) {
      pushInMatch(finalAggregate, "children", parseObjectIdList(children));
    }

    if (type) {
      pushInMatch(finalAggregate, "type", parseQueryList(type));
    }

    if (assignee) {
      pushInMatch(finalAggregate, "assignee", parseQueryList(assignee));
    }

    if (from) {
      finalAggregate.push({
        $match: { dueDate: { $gte: moment(from).startOf("day").toDate() } },
      });
    }

    if (to) {
      finalAggregate.push({
        $match: { dueDate: { $lte: moment(to).endOf("day").toDate() } },
      });
    }

    if (status) {
      pushInMatch(finalAggregate, "status", parseQueryList(status));
    }

    finalAggregate.push(...homeworkLookupStages());

    const homeworks = await Homework.aggregatePaginate(Homework.aggregate(finalAggregate), {
      page,
      limit,
    });

    return res.json(ApiResponse(homeworks));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getAllChildHomework = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    const { from, to } = req.query;

    const child = await Children.findById(req.params.id);
    if (!child) {
      return res.status(404).json(ApiResponse({}, "Child not found", false));
    }
    if (!(await assertCanAccessChild(req, res, child._id))) {
      return;
    }

    const matchConditions = [
      { assignee: "CHILD", children: child._id },
    ];

    if (child.classroom) {
      matchConditions.push({
        assignee: "CLASS",
        classroom: child.classroom,
      });
    }

    const finalAggregate = [
      {
        $match: {
          status: "ACTIVE",
          $or: matchConditions,
        },
      },
      { $sort: { assignDate: -1 } },
    ];

    if (from) {
      finalAggregate.push({
        $match: { dueDate: { $gte: moment(from).startOf("day").toDate() } },
      });
    }

    if (to) {
      finalAggregate.push({
        $match: { dueDate: { $lte: moment(to).endOf("day").toDate() } },
      });
    }

    finalAggregate.push(...homeworkLookupStages());

    const homeworks = await Homework.aggregatePaginate(Homework.aggregate(finalAggregate), {
      page,
      limit,
    });

    return res.json(ApiResponse(homeworks));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getHomeworkById = async (req, res) => {
  try {
    const result = await Homework.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(req.params.id) } },
      ...homeworkLookupStages(),
    ]);

    const homework = result[0];
    if (!homework) {
      return res.status(404).json(ApiResponse({}, "Homework not found", false));
    }

    if (req.userRole === "parent") {
      const childIds = (await getParentChildIds(req)).map(String);
      const assignedChild = homework.children ? String(homework.children?._id || homework.children) : null;
      const assignedClass = homework.classroom ? String(homework.classroom?._id || homework.classroom) : null;
      let allowed = assignedChild && childIds.includes(assignedChild);
      if (!allowed && assignedClass) {
        const parentChildren = await Children.find({ parent: req.user._id }).select("classroom").lean();
        allowed = parentChildren.some((item) => String(item.classroom) === assignedClass);
      }
      if (!allowed) {
        return res.status(403).json(ApiResponse({}, "Access denied", false));
      }
    }

    if (req.userRole === "teacher" && String(homework.teacher?._id || homework.teacher) !== String(req.user._id)) {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }

    return res.json(ApiResponse({ homework }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.updateHomework = async (req, res) => {
  try {
    const existing = await Homework.findById(req.params.id);
    if (!existing) {
      return res.status(404).json(ApiResponse({}, "Homework not found", false));
    }
    if (!assertHomeworkWriteAccess(req, res, existing)) {
      return;
    }

    const payload = await normalizeHomeworkPayload(
      { ...existing.toObject(), ...req.body },
      req
    );
    const validationError = await validateHomeworkAssignment(payload, req);

    if (validationError) {
      return res.status(400).json(ApiResponse({}, validationError, false));
    }

    const homework = await Homework.findByIdAndUpdate(req.params.id, payload, { new: true });

    return res.json(ApiResponse({ homework }, "Homework updated successfully", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.deleteHomework = async (req, res) => {
  try {
    const homework = await Homework.findById(req.params.id);

    if (!homework) {
      return res.status(404).json(ApiResponse({}, "Homework not found", false));
    }
    if (!assertHomeworkWriteAccess(req, res, homework)) {
      return;
    }

    await Homework.findByIdAndRemove(req.params.id);

    return res.json(ApiResponse({}, "Homework deleted successfully", true));
  } catch (error) {
    return res.json(
      ApiResponse({}, errorHandler(error) ? errorHandler(error) : error.message, false)
    );
  }
};
