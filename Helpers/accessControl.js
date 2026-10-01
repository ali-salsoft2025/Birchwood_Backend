const Children = require("../Models/Children");
const { ApiResponse } = require("./index");

async function canAccessChild(req, childId) {
  if (!childId) return false;
  if (req.isAdmin) return true;

  const child = await Children.findById(childId).select("parent classroom");
  if (!child) return false;

  if (req.userRole === "parent") {
    return String(child.parent) === String(req.user._id);
  }

  if (req.userRole === "teacher") {
    const teacherClassroom = req.user.classroom;
    return Boolean(
      teacherClassroom && child.classroom && String(child.classroom) === String(teacherClassroom)
    );
  }

  return false;
}

async function assertCanAccessChild(req, res, childId) {
  const allowed = await canAccessChild(req, childId);
  if (allowed) return true;
  const child = await Children.findById(childId).select("_id");
  if (!child) {
    res.status(404).json(ApiResponse({}, "Child not found", false));
    return false;
  }
  res.status(403).json(ApiResponse({}, "Access denied", false));
  return false;
}

function canWriteHomework(req, homework) {
  if (req.isAdmin) return true;
  if (req.userRole === "parent") return false;
  if (req.userRole === "teacher") {
    return homework && String(homework.teacher) === String(req.user._id);
  }
  return false;
}

function assertHomeworkWriteAccess(req, res, homework) {
  if (canWriteHomework(req, homework)) return true;
  if (req.userRole === "parent") {
    res.status(403).json(ApiResponse({}, "Parents cannot modify homework", false));
    return false;
  }
  res.status(403).json(ApiResponse({}, "Access denied", false));
  return false;
}

function canModifyPost(req, post, { adminCanEdit = false } = {}) {
  if (!post) return false;
  if (req.isAdmin) return adminCanEdit;
  return String(post.author) === String(req.user._id);
}

function assertPostModifyAccess(req, res, post, options = {}) {
  if (canModifyPost(req, post, options)) return true;
  if (req.isAdmin && !options.adminCanEdit) {
    res.status(403).json(ApiResponse({}, "Admins cannot edit posts", false));
    return false;
  }
  res.status(403).json(ApiResponse({}, "Access denied", false));
  return false;
}

function classroomIdOf(req) {
  const classroom = req.user?.classroom;
  return classroom && (classroom._id || classroom);
}

async function canReadClassroom(req, classroomId) {
  if (!classroomId) return false;
  if (req.isAdmin) return true;
  if (req.userRole === "teacher") {
    const own = classroomIdOf(req);
    return Boolean(own && String(own) === String(classroomId));
  }
  if (req.userRole === "parent") {
    const row = await Children.findOne({
      parent: req.user._id,
      classroom: classroomId,
    })
      .select("_id")
      .lean();
    return Boolean(row);
  }
  return false;
}

async function canReadPost(req, post) {
  if (!post) return false;
  if (req.isAdmin) return true;
  const type = String(post.type || "").toUpperCase();
  const classroomId = post.classroom?._id || post.classroom;
  const rawChildren = post.children;
  const childIds = (Array.isArray(rawChildren) ? rawChildren : rawChildren ? [rawChildren] : [])
    .map((item) => item?._id || item)
    .filter(Boolean);

  if (type === "CHILD" && childIds.length) {
    if (req.userRole === "teacher") return canReadClassroom(req, classroomId);
    if (req.userRole === "parent") {
      for (const id of childIds) {
        if (await canAccessChild(req, id)) return true;
      }
    }
    return false;
  }
  return canReadClassroom(req, classroomId);
}

async function assertCanReadPost(req, res, post) {
  if (await canReadPost(req, post)) return true;
  res.status(403).json(ApiResponse({}, "Access denied", false));
  return false;
}

async function postListMatch(req) {
  if (req.isAdmin) return null;
  if (req.userRole === "teacher") {
    const own = classroomIdOf(req);
    if (!own) return { _id: { $exists: false } };
    return { classroom: own };
  }
  if (req.userRole === "parent") {
    const kids = await Children.find({ parent: req.user._id }).select("_id classroom").lean();
    return {
      $or: [
        { type: "CLASS", classroom: { $in: kids.map((item) => item.classroom).filter(Boolean) } },
        { type: "CHILD", children: { $in: kids.map((item) => item._id) } },
      ],
    };
  }
  return { _id: { $exists: false } };
}

async function getParentChildIds(req) {
  if (req.userRole !== "parent" || !req.user?._id) return [];
  const rows = await Children.find({ parent: req.user._id }).select("_id").lean();
  return rows.map((item) => item._id);
}

module.exports = {
  canAccessChild,
  assertCanAccessChild,
  canWriteHomework,
  assertHomeworkWriteAccess,
  canModifyPost,
  assertPostModifyAccess,
  canReadClassroom,
  canReadPost,
  assertCanReadPost,
  postListMatch,
  getParentChildIds,
};
