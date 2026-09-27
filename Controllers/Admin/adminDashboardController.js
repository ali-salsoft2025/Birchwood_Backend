const Children = require("../../Models/Children");
const Teacher = require("../../Models/Teacher");
const Classroom = require("../../Models/Classroom");
const Activity = require("../../Models/Activity");
const Parent = require("../../Models/Parent");
const Attendance = require("../../Models/Attendance");
const TeacherAttendance = require("../../Models/TeacherAttendance");
const Holiday = require("../../Models/Holiday");
const { ApiResponse } = require("../../Helpers/index");
const { errorHandler } = require("../../Helpers/errorHandler");

const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const OVERVIEW_RANGES = ["thisWeek", "lastWeek", "thisMonth", "lastMonth"];
const EVENT_COLOR = "#fc7a3a";
const HOLIDAY_COLOR = "#5b4aa8";

const startOfDay = (date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

const startOfWeekMonday = (date) => {
  const next = startOfDay(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
};

const mongoDowToMonIndex = (dow) => (dow === 1 ? 6 : dow - 2);

const sum = (values) => values.reduce((total, value) => total + Number(value || 0), 0);

function ymd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function holidayStart(item) {
  return startOfDay(new Date(item.date));
}

function holidayEnd(item) {
  return startOfDay(new Date(item.endDate || item.date));
}

function isEvent(item) {
  return String(item?.type || "HOLIDAY").toUpperCase() === "EVENT";
}

function serializeHoliday(item) {
  const start = holidayStart(item);
  const end = holidayEnd(item);
  return {
    _id: String(item._id),
    name: item.name || (isEvent(item) ? "Event" : "Holiday"),
    type: isEvent(item) ? "EVENT" : "HOLIDAY",
    audience: item.audience || "BOTH",
    date: start.toISOString(),
    endDate: end.toISOString(),
    startDay: start.getDate(),
    endDay: end.getDate(),
    color: isEvent(item) ? EVENT_COLOR : HOLIDAY_COLOR,
  };
}

/** Holidays/events that overlap any day in [monthStart, monthEnd]. */
function monthOverlapMatch(monthStart, monthEnd) {
  return {
    $or: [
      { date: { $gte: monthStart, $lte: monthEnd } },
      { endDate: { $gte: monthStart, $lte: monthEnd } },
      {
        date: { $lte: monthStart },
        endDate: { $gte: monthEnd },
      },
    ],
  };
}

function buildCalendarMarks(holidays, monthStart, monthEnd) {
  const marks = [];
  holidays.forEach((item) => {
    const start = holidayStart(item);
    const end = holidayEnd(item);
    const type = isEvent(item) ? "event" : "holiday";
    const color = isEvent(item) ? EVENT_COLOR : HOLIDAY_COLOR;
    const cursor = new Date(Math.max(start.getTime(), monthStart.getTime()));
    const last = new Date(Math.min(end.getTime(), startOfDay(monthEnd).getTime()));
    while (cursor <= last) {
      marks.push({
        day: cursor.getDate(),
        date: ymd(cursor),
        type,
        label: item.name,
        color,
        id: String(item._id),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  });
  return marks;
}

async function weeklyCounts(weekStart, model, dateField, extraMatch = {}) {
  const weekEnd = endOfDay(new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000));
  const rows = await model.aggregate([
    {
      $match: {
        ...extraMatch,
        [dateField]: { $gte: weekStart, $lte: weekEnd },
      },
    },
    {
      $group: {
        _id: { $dayOfWeek: `$${dateField}` },
        total: { $sum: 1 },
      },
    },
  ]);

  const totals = Array(7).fill(0);
  rows.forEach((row) => {
    totals[mongoDowToMonIndex(row._id)] = row.total;
  });
  return { totals, hasData: rows.length > 0 };
}

async function statusBreakdown(model, rangeStart, rangeEnd, dateField = "checkIn", extraMatch = {}) {
  const rows = await model.aggregate([
    {
      $match: {
        ...extraMatch,
        [dateField]: { $gte: rangeStart, $lte: rangeEnd },
      },
    },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const stats = { PRESENT: 0, ABSENT: 0, LEAVE: 0, HOLIDAY: 0 };
  rows.forEach((row) => {
    if (stats[row._id] !== undefined) stats[row._id] = row.count;
  });
  const tracked = stats.PRESENT + stats.ABSENT + stats.LEAVE;
  const rate = tracked ? Math.round((stats.PRESENT / tracked) * 100) : 0;
  return { ...stats, tracked, rate, total: tracked + stats.HOLIDAY };
}

function getOverviewWindow(range, now) {
  if (range === "lastWeek") {
    const start = startOfWeekMonday(now);
    start.setDate(start.getDate() - 7);
    return {
      start,
      end: endOfDay(new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000)),
      mode: "week",
    };
  }

  if (range === "thisMonth") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      start,
      end: endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      mode: "month",
    };
  }

  if (range === "lastMonth") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return {
      start,
      end: endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)),
      mode: "month",
    };
  }

  const start = startOfWeekMonday(now);
  return {
    start,
    end: endOfDay(new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000)),
    mode: "week",
  };
}

async function dailyPresentCounts(rangeStart, rangeEnd, model) {
  const rows = await model.aggregate([
    {
      $match: {
        status: "PRESENT",
        checkIn: { $gte: rangeStart, $lte: rangeEnd },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$checkIn" } },
        total: { $sum: 1 },
      },
    },
  ]);

  const byDay = {};
  rows.forEach((row) => {
    byDay[row._id] = row.total;
  });

  const labels = [];
  const values = [];
  const cursor = startOfDay(rangeStart);
  const last = startOfDay(rangeEnd);
  while (cursor <= last) {
    labels.push(String(cursor.getDate()));
    values.push(byDay[ymd(cursor)] || 0);
    cursor.setDate(cursor.getDate() + 1);
  }

  return { labels, values };
}

async function overviewSeries(window, model) {
  if (window.mode === "week") {
    const data = await weeklyCounts(window.start, model, "checkIn", { status: "PRESENT" });
    return { labels: WEEK_LABELS, values: data.totals };
  }
  return dailyPresentCounts(window.start, window.end, model);
}

function buildBreakdownChart(stats = {}) {
  return {
    labels: ["Present", "Absent", "Leave", "Holiday"],
    values: [
      stats.PRESENT || 0,
      stats.ABSENT || 0,
      stats.LEAVE || 0,
      stats.HOLIDAY || 0,
    ],
    rate: stats.rate || 0,
    tracked: stats.tracked || 0,
  };
}

exports.getOverview = async (req, res) => {
  try {
    const now = new Date();
    const year = Number(req.query.year) || now.getFullYear();
    const month = Number(req.query.month) || now.getMonth() + 1;
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = endOfDay(new Date(year, month, 0));
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const thisWeekStart = startOfWeekMonday(now);
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const rangeKey = OVERVIEW_RANGES.includes(String(req.query.range || ""))
      ? String(req.query.range)
      : "thisWeek";
    const overviewWindow = getOverviewWindow(rangeKey, now);

    const [
      students,
      teachers,
      classes,
      activities,
      parents,
      studentTodayStats,
      teacherTodayStats,
      studentMonthStats,
      teacherMonthStats,
      studentWeekPresent,
      studentLastWeekPresent,
      teacherWeekPresent,
      teacherLastWeekPresent,
      studentWeekAbsent,
      teacherWeekAbsent,
      studentOverview,
      teacherOverview,
      monthHolidays,
      upcomingHolidays,
    ] = await Promise.all([
      Children.countDocuments({ status: { $ne: "INACTIVE" } }),
      Teacher.countDocuments({ status: "ACTIVE" }),
      Classroom.countDocuments({ status: "ACTIVE" }),
      Activity.countDocuments({ status: "ACTIVE" }),
      Parent.countDocuments({ status: { $ne: "INACTIVE" } }),
      statusBreakdown(Attendance, todayStart, todayEnd),
      statusBreakdown(TeacherAttendance, todayStart, todayEnd),
      statusBreakdown(Attendance, monthStart, monthEnd),
      statusBreakdown(TeacherAttendance, monthStart, monthEnd),
      weeklyCounts(thisWeekStart, Attendance, "checkIn", { status: "PRESENT" }),
      weeklyCounts(lastWeekStart, Attendance, "checkIn", { status: "PRESENT" }),
      weeklyCounts(thisWeekStart, TeacherAttendance, "checkIn", { status: "PRESENT" }),
      weeklyCounts(lastWeekStart, TeacherAttendance, "checkIn", { status: "PRESENT" }),
      weeklyCounts(thisWeekStart, Attendance, "checkIn", { status: "ABSENT" }),
      weeklyCounts(thisWeekStart, TeacherAttendance, "checkIn", { status: "ABSENT" }),
      overviewSeries(overviewWindow, Attendance),
      overviewSeries(overviewWindow, TeacherAttendance),
      Holiday.find(monthOverlapMatch(monthStart, monthEnd)).sort({ date: 1 }).lean(),
      Holiday.find({
        $or: [{ date: { $gte: todayStart } }, { endDate: { $gte: todayStart } }],
      })
        .sort({ date: 1 })
        .limit(8)
        .lean(),
    ]);

    const monthItems = monthHolidays.map(serializeHoliday);
    const upcomingItems = upcomingHolidays.map(serializeHoliday);
    const calendarMarks = buildCalendarMarks(monthHolidays, monthStart, monthEnd);

    return res.json(
      ApiResponse(
        {
          stats: {
            students,
            teachers,
            classes,
            activities,
            parents,
            studentRateMonth: studentMonthStats.rate,
            teacherRateMonth: teacherMonthStats.rate,
            studentsPresentToday: studentTodayStats.PRESENT,
            teachersPresentToday: teacherTodayStats.PRESENT,
            studentsAbsentToday: studentTodayStats.ABSENT,
            teachersAbsentToday: teacherTodayStats.ABSENT,
          },
          attendance: {
            students: {
              today: studentTodayStats,
              month: studentMonthStats,
              breakdown: buildBreakdownChart(studentMonthStats),
            },
            teachers: {
              today: teacherTodayStats,
              month: teacherMonthStats,
              breakdown: buildBreakdownChart(teacherMonthStats),
            },
            weekly: {
              labels: WEEK_LABELS,
              studentsPresent: studentWeekPresent.totals,
              studentsPresentLast: studentLastWeekPresent.totals,
              teachersPresent: teacherWeekPresent.totals,
              teachersPresentLast: teacherLastWeekPresent.totals,
              studentsAbsent: studentWeekAbsent.totals,
              teachersAbsent: teacherWeekAbsent.totals,
              studentsPresentTotal: sum(studentWeekPresent.totals),
              teachersPresentTotal: sum(teacherWeekPresent.totals),
            },
            overview: {
              range: rangeKey,
              labels: studentOverview.labels,
              studentsPresent: studentOverview.values,
              teachersPresent: teacherOverview.values,
              studentsPresentTotal: sum(studentOverview.values),
              teachersPresentTotal: sum(teacherOverview.values),
            },
          },
          calendar: {
            year,
            month,
            marks: calendarMarks,
            monthItems,
            upcoming: upcomingItems,
          },
        },
        "Dashboard loaded",
        true
      )
    );
  } catch (error) {
    return res.json(
      ApiResponse({}, errorHandler(error) ? errorHandler(error) : error.message, false)
    );
  }
};
