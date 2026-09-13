const Children = require("../Models/Children");
const { sendNotificationToUser } = require("./notification");

const toId = (value) => (value ? String(value) : null);

exports.sendChildAssignmentNotification = async (parentId, childData) => {
  const assignee = toId(parentId);
  if (!assignee || !childData) return;

  await sendNotificationToUser(
    assignee,
    "Child Assigned",
    `A child has been assigned to you: ${childData.firstName} ${childData.lastName}`
  );
};

exports.childCheckinNotification = async (recieverId, childData) => {
  const assignee = toId(recieverId);
  if (!assignee || !childData) return;

  await sendNotificationToUser(
    assignee,
    "Child Checked In",
    `${childData.firstName} ${childData.lastName} has been checked in.`
  );
};

exports.childLeaveNotification = async (recieverId, childData) => {
  const assignee = toId(recieverId);
  if (!assignee || !childData) return;

  await sendNotificationToUser(
    assignee,
    "Child Leave",
    `${childData.firstName} ${childData.lastName} has taken a leave.`
  );
};

exports.sendCommentNotification = async ({ post, authorType }) => {
  if (!post) return;

  const populated = await post.populate([
    { path: "children" },
    { path: "author", select: "_id" },
  ]);
  const teacherId = toId(populated.author?._id || populated.author);
  const parentIds = new Set();

  if (populated.type === "CHILD") {
    (populated.children || []).forEach((child) => {
      if (child && child.parent) parentIds.add(toId(child.parent));
    });
  } else if (populated.type === "CLASS") {
    const childrenInClass = await Children.find({ classroom: populated.classroom });
    childrenInClass.forEach((child) => {
      if (child.parent) parentIds.add(toId(child.parent));
    });
  }

  if (authorType === "parent" && teacherId) {
    await sendNotificationToUser(
      teacherId,
      "New Comment",
      `A parent commented on post ${populated._id}`
    );
  } else if (authorType === "teacher") {
    await Promise.all(
      [...parentIds].filter(Boolean).map((parentId) =>
        sendNotificationToUser(
          parentId,
          "New Comment",
          `The teacher commented on post ${populated._id}`
        )
      )
    );
  }
};

exports.sendLikeAndLoveNotification = async ({
  post,
  authorType,
  title,
  msg,
}) => {
  if (!post) return;

  const populated = await post.populate([
    { path: "children" },
    { path: "author", select: "_id" },
  ]);
  const teacherId = toId(populated.author?._id || populated.author);
  const parentIds = new Set();
  const content = `${msg}: ${populated._id}`;

  if (populated.type === "CHILD") {
    (populated.children || []).forEach((child) => {
      if (child && child.parent) parentIds.add(toId(child.parent));
    });
  } else if (populated.type === "CLASS") {
    const childrenInClass = await Children.find({ classroom: populated.classroom });
    childrenInClass.forEach((child) => {
      if (child.parent) parentIds.add(toId(child.parent));
    });
  }

  if (authorType === "parent" && teacherId) {
    await sendNotificationToUser(teacherId, title, content);
  } else if (authorType === "teacher") {
    await Promise.all(
      [...parentIds].filter(Boolean).map((parentId) =>
        sendNotificationToUser(parentId, title, content)
      )
    );
  }
};

exports.sendAdminActivityUpdatesToTeachers = async () => {
  return;
};
