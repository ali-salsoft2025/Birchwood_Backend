var cron = require('node-cron');
const Teacher = require("../Models/Teacher");
const Children = require("../Models/Children");
const Parent = require("../Models/Parent");
const Holiday = require("../Models/Holiday");
const ChildAttendance = require("../Models/Attendance");
const Notification = require("../Models/Notification");
const { sendNotificationToUser } = require("../Helpers/notification");
const {
  isSchoolWeekday,
  schoolDayBounds,
  previousSchoolWeekday,
} = require("../Helpers/schoolDay");

const { purgeOldNotifications } = require("../Helpers/notificationCleanup");
const { runFeeReminders } = require("../Helpers/feePolicy");
const SCHOOL_TZ = "Asia/Karachi";
const CHECKIN_TITLE = "Mark today's check-in";

const { closeUnmarkedTeacherDays } = require("../Helpers/autoAbsent");

// Once checkout time has passed, teachers with no check-in or leave are absent.
// This does not wait for midnight, and it skips weekends and teacher holidays.
cron.schedule('*/15 6-22 * * *', async () => {
  try {
    const result = await closeUnmarkedTeacherDays(new Date(), { lookbackDays: 0 });
    if (result.marked) {
      console.log(`Marked ${result.marked} teacher(s) absent after the school day closed.`);
    }
  } catch (error) {
    console.error('Error marking teacher absence:', error);
  }
}, { timezone: SCHOOL_TZ });

// Safety net for days the daytime job missed, including Saturday duty days.
cron.schedule('10 0 * * *', async () => {
  try {
    const result = await closeUnmarkedTeacherDays(new Date(), { lookbackDays: 31 });
    if (result.marked) {
      console.log(`Backfilled ${result.marked} teacher absence record(s).`);
    }
  } catch (error) {
    console.error('Error backfilling teacher absence:', error);
  }
}, { timezone: SCHOOL_TZ });



cron.schedule('0 0 * * 2-6', async () => {
  try {
    const previousDay = previousSchoolWeekday(new Date());
    const { start, end } = schoolDayBounds(previousDay);
    if (!isSchoolWeekday(previousDay)) return;

    const isHoliday = await Holiday.findOne({
      date: { $gte: start, $lte: end },
    });
    if (isHoliday) return;

    const childrens = await Children.find({ status: "ACTIVE" });
    for (const children of childrens) {
      const existingAttendance = await ChildAttendance.findOne({
        children: children._id,
        checkIn: { $gte: start, $lte: end },
      });
      if (!existingAttendance) {
        await ChildAttendance.create({
          children: children._id,
          classroom: children.classroom,
          checkIn: start,
          markedBy: "ADMIN",
          status: "ABSENT",
        });
      }
    }
  } catch (error) {
    console.error('Error updating child attendance:', error);
  }
}, { timezone: SCHOOL_TZ });

// At pickup open (1:00 PM), mark unmarked children ABSENT so the day does not wait for midnight.
cron.schedule('0 13 * * 1-5', async () => {
  try {
    const now = new Date();
    if (!isSchoolWeekday(now)) return;
    const { start, end } = schoolDayBounds(now);

    const isHoliday = await Holiday.findOne({
      date: { $gte: start, $lte: end },
    });
    if (isHoliday) return;

    const childrens = await Children.find({ status: "ACTIVE" });
    for (const children of childrens) {
      const existingAttendance = await ChildAttendance.findOne({
        children: children._id,
        checkIn: { $gte: start, $lte: end },
      });
      if (!existingAttendance) {
        await ChildAttendance.create({
          children: children._id,
          classroom: children.classroom,
          checkIn: start,
          markedBy: "ADMIN",
          status: "ABSENT",
        });
      }
    }
  } catch (error) {
    console.error('Error marking absent at pickup:', error);
  }
}, { timezone: SCHOOL_TZ });

cron.schedule('0 7 * * 1-5', async () => {
  try {
    const now = new Date();
    if (!isSchoolWeekday(now)) return;
    const { start, end } = schoolDayBounds(now);
    const children = await Children.find({ status: "ACTIVE", parent: { $ne: null } }).select("parent firstName lastName");
    const marked = await ChildAttendance.find({
      checkIn: { $gte: start, $lte: end },
      status: { $in: ["PRESENT", "LEAVE"] },
    }).select("children");
    const markedIds = new Set(marked.map((row) => String(row.children)));
    const parents = new Map();

    children.forEach((child) => {
      if (markedIds.has(String(child._id)) || !child.parent) return;
      const key = String(child.parent);
      const names = parents.get(key) || [];
      names.push(`${child.firstName || ""} ${child.lastName || ""}`.trim());
      parents.set(key, names);
    });

    for (const [parentId, names] of parents) {
      const alreadySent = await Notification.findOne({
        assignee: parentId,
        title: CHECKIN_TITLE,
        createdAt: { $gte: start, $lte: end },
      });
      if (alreadySent) continue;
      const parent = await Parent.findById(parentId).select("_id");
      if (!parent) continue;
      await sendNotificationToUser(
        parent._id,
        CHECKIN_TITLE,
        `School starts at 7:00 AM. On-time check-in is 6:00–8:00 AM. Mark check-in or leave for ${names.filter(Boolean).join(", ")}.`
      );
    }
  } catch (error) {
    console.error("Error sending check-in reminders:", error);
  }
}, { timezone: SCHOOL_TZ });



//make all teachers checkIn and CheckOut false at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('Running a daily task to update teachers checkin and checkout statuses');
  try {
    // Update all teachers to set checkin and checkout as false
    const updateResult = await Teacher.updateMany({}, { $set: { checkIn: false, checkOut: false } });
    
  } catch (error) {
    console.error('Error updating teachers checkin and checkout statuses:', error);
  }
});


//make all children checkIn and CheckOut false at midnight
cron.schedule('0 0 * * *', async () => {
  try {
    await Children.updateMany({}, { $set: { checkIn: false } });
  } catch (error) {
    console.error('Error updating children checkin statuses:', error);
  }
}, { timezone: SCHOOL_TZ });
// Auto-delete old notices + notifications so the collection does not grow forever.
// Retention: NOTIFICATION_RETENTION_DAYS (default 60).
cron.schedule('15 2 * * *', async () => {
  try {
    const result = await purgeOldNotifications();
    if (result.deleted > 0) {
      console.log(
        `Purged ${result.deleted} old notification(s) (retention ${result.days} days).`,
      );
    }
  } catch (error) {
    console.error('Error purging old notifications:', error);
  }
}, { timezone: SCHOOL_TZ });

cron.schedule("0 8 * * *", async () => {
  try {
    const result = await runFeeReminders();
    if (result.reminders || result.overdueNotices) {
      console.log(`Fee notices: ${result.reminders} reminder(s), ${result.overdueNotices} overdue.`);
    }
  } catch (error) {
    console.error("Error sending fee reminders:", error);
  }
}, { timezone: SCHOOL_TZ });

// Chat images/docs left only on the server are removed after ~30 days.
// Devices that already downloaded a copy keep it locally until the user deletes it.
const { purgeExpiredChatAttachments } = require('../Helpers/chatAttachments');
cron.schedule('30 2 * * *', async () => {
  try {
    const result = await purgeExpiredChatAttachments();
    if (result.purged > 0) {
      console.log(
        `Purged ${result.purged} expired chat attachment(s) (retention ${result.days} days).`,
      );
    }
  } catch (error) {
    console.error('Error purging expired chat attachments:', error);
  }
}, { timezone: SCHOOL_TZ });
