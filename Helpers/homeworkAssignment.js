const mongoose = require("mongoose");
const Children = require("../Models/Children");
const Classroom = require("../Models/Classroom");
const Teacher = require("../Models/Teacher");
const { sendNotificationToUser } = require("./notification");

const ASSIGNEE_TYPES = ["CLASS", "CHILD"];
const HOMEWORK_TYPES = ["HOMEWORK", "NOTICE", "WARNING"];

function resolveTeacherId(body = {}, req = {}) {
  if (req.isAdmin && body.teacher) {
    return body.teacher;
  }
  if (req.userRole === "teacher" && req.user?._id) {
    return req.user._id;
  }
  return body.teacher || null;
}

function childIdList(value) {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  const ids = [];
  raw.forEach((item) => {
    const id = item && typeof item === "object" ? item._id : item;
    const text = id == null ? "" : String(id).trim();
    if (text && mongoose.Types.ObjectId.isValid(text) && !ids.includes(text)) {
      ids.push(text);
    }
  });
  return ids;
}

async function normalizeHomeworkPayload(body = {}, req = {}) {
  const assignee = ASSIGNEE_TYPES.includes(body.assignee) ? body.assignee : "CHILD";
  const type = HOMEWORK_TYPES.includes(body.type) ? body.type : "HOMEWORK";
  const teacher = resolveTeacherId(body, req);
  const childIds = childIdList(body.children);

  const payload = {
    title: String(body.title || "").trim(),
    description: String(body.description || "").trim(),
    teacher,
    assignee,
    type,
    dueDate: body.dueDate,
    assignDate: body.assignDate || new Date(),
    status: body.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    classroom: null,
    children: null,
  };

  if (assignee === "CLASS") {
    payload.classroom = body.classroom || null;
  } else {
    payload.children = childIds[0] || null;
    payload.childIds = childIds;
  }

  return payload;
}

async function validateHomeworkAssignment(payload = {}, req = {}) {
  if (req.userRole === "parent") {
    return "Parents cannot create or modify homework";
  }
  if (!payload.title) {
    return "Title is required";
  }
  if (!payload.description) {
    return "Description is required";
  }
  if (!payload.dueDate) {
    return "Due date is required";
  }
  if (!payload.teacher) {
    return "Teacher is required";
  }

  const teacher = await Teacher.findById(payload.teacher);
  if (!teacher) {
    return "Teacher not found";
  }

  if (payload.assignee === "CLASS") {
    if (!payload.classroom) {
      return "Classroom is required for class assignments";
    }
    const classroom = await Classroom.findById(payload.classroom);
    if (!classroom) {
      return "Classroom not found";
    }
    if (
      req.userRole === "teacher" &&
      teacher.classroom &&
      String(teacher.classroom) !== String(payload.classroom)
    ) {
      return "You can only assign homework to your own classroom";
    }
    return null;
  }

  const childIds = payload.childIds?.length ? payload.childIds : childIdList(payload.children);
  if (!childIds.length) {
    return "Student is required for individual assignments";
  }

  for (const childId of childIds) {
    const child = await Children.findById(childId);
    if (!child) {
      return "Student not found";
    }
    if (req.userRole === "teacher" && teacher.classroom) {
      if (!child.classroom || String(child.classroom) !== String(teacher.classroom)) {
        return "You can only assign homework to students in your classroom";
      }
    }
  }

  return null;
}

async function notifyHomeworkAssigned(homework) {
  if (!homework) return;

  const title = homework.type === "HOMEWORK" ? "New homework" : homework.type === "NOTICE" ? "New notice" : "New warning";
  const content = homework.title || "A new assignment was posted.";

  if (homework.assignee === "CHILD" && homework.children) {
    const child = await Children.findById(homework.children).select("parent firstName lastName");
    if (child?.parent) {
      await sendNotificationToUser(
        child.parent,
        title,
        `${content} for ${child.firstName || "your child"}`,
        "NOTIFICATION"
      );
    }
    return;
  }

  if (homework.assignee === "CLASS" && homework.classroom) {
    const students = await Children.find({ classroom: homework.classroom }).select("parent");
    const parentIds = [...new Set(students.map((item) => String(item.parent)).filter(Boolean))];
    await Promise.all(
      parentIds.map((parentId) => sendNotificationToUser(parentId, title, content, "NOTIFICATION"))
    );
  }
}

function homeworkLookupStages() {
  return [
    {
      $lookup: {
        from: "teachers",
        localField: "teacher",
        foreignField: "_id",
        as: "teacherDoc",
      },
    },
    { $unwind: { path: "$teacherDoc", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "childrens",
        localField: "children",
        foreignField: "_id",
        as: "childDoc",
      },
    },
    { $unwind: { path: "$childDoc", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "classrooms",
        localField: "classroom",
        foreignField: "_id",
        as: "classroomDoc",
      },
    },
    { $unwind: { path: "$classroomDoc", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        teacherName: {
          $trim: {
            input: {
              $concat: [
                { $ifNull: ["$teacherDoc.firstName", ""] },
                " ",
                { $ifNull: ["$teacherDoc.lastName", ""] },
              ],
            },
          },
        },
        classroomName: { $ifNull: ["$classroomDoc.classroomName", ""] },
        teacherDoc: {
          _id: "$teacherDoc._id",
          firstName: "$teacherDoc.firstName",
          lastName: "$teacherDoc.lastName",
        },
      },
    },
  ];
}

module.exports = {
  ASSIGNEE_TYPES,
  HOMEWORK_TYPES,
  childIdList,
  normalizeHomeworkPayload,
  validateHomeworkAssignment,
  notifyHomeworkAssigned,
  homeworkLookupStages,
};
