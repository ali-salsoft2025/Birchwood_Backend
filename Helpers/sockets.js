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

async function notifyPostCreator(post, actorId, title, content) {
  const authorId = toId(post.author?._id || post.author);
  if (!authorId || authorId === toId(actorId)) return;
  await sendNotificationToUser(authorId, title, content);
}

exports.sendCommentNotification = async ({ post, comment }) => {
  if (!post) return;
  const actorId = toId(comment?.author?._id || comment?.author);
  await notifyPostCreator(post, actorId, "New comment", "Someone commented on your post");
};

exports.sendLikeAndLoveNotification = async ({ post, userId, title }) => {
  if (!post || title === "Post UnLiked") return;
  await notifyPostCreator(post, userId, "New like", "Someone liked your post");
};

exports.sendAdminActivityUpdatesToTeachers = async () => {
  return;
};
