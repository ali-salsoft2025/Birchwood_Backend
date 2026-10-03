//Models
const Children = require("../../Models/Children");
const Attendance = require("../../Models/TeacherAttendance");
const fs = require("fs");
const crypto = require("crypto");
const moment = require("moment");
//Helpers 
const { generateToken } = require("../../Helpers/index");
const { ApiResponse } = require("../../Helpers/index");
const { validateToken } = require("../../Helpers/index");
const { generateString } = require("../../Helpers/index");
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
const Teacher = require("../../Models/Teacher");
const SchoolSettings = require("../../Models/SchoolSettings");
const {
  describeTeacherRules,
  punchState,
  quotaAllows,
  calendarYearBounds,
} = require("../../Helpers/teacherDay");
const {
  DEFAULT_SCHOOL_TIME_ZONE,
  isValidTimeZone,
  schoolDayBounds,
  schoolMonthBounds,
  schoolParts,
  zonedWallTime,
} = require("../../Helpers/schoolDay");

async function loadTeacherRules() {
  const doc = await SchoolSettings.getSingleton();
  const timeZone = isValidTimeZone(doc.timeZone) ? doc.timeZone : DEFAULT_SCHOOL_TIME_ZONE;
  return { rules: { ...describeTeacherRules(doc.teacherAttendance || {}), timeZone }, timeZone };
}

exports.markCheckIn = async (req, res) => {
    let teacher = await Teacher.findById(req.user._id);

    if (!teacher) {
        return res.json(ApiResponse({}, "Teacher Not Found", false));
    }

    try {
        const { rules, timeZone } = await loadTeacherRules();
        const now = new Date();
        const { resolveTeacherDay } = require("../../Helpers/teacherWorkDay");
        const day = await resolveTeacherDay(now, rules, timeZone);
        const punch = day.punch;
        if (day.off) {
            const reason = day.reason === "holiday"
                ? "Teachers are off for this holiday"
                : "Teachers are off on the weekend";
            return res.status(400).json(ApiResponse({}, reason, false));
        }
        if (!punch.checkInOpen) {
            return res.status(400).json(
                ApiResponse({}, `Check-in opens at ${day.described.checkInOpensLabel}`, false)
            );
        }
        const { start, end } = schoolDayBounds(now, timeZone);

        // Check if attendance is already marked for the school day
        let existingAttendance = await Attendance.findOne({
            teacher,
            checkIn: {
                $gte: start,
                $lte: end
            }
        });

        if (existingAttendance) {
            if (existingAttendance.leaveStatus === "PENDING" || existingAttendance.status === "LEAVE") {
                return res.status(400).json(ApiResponse({}, "Leave is already applied for today", false));
            }
            if (existingAttendance.status !== "ABSENT") {
                return res.status(400).json(ApiResponse({}, "Check-In Already Marked", false));
            }
            existingAttendance.status = "PRESENT";
            existingAttendance.checkIn = now;
            existingAttendance.checkOut = null;
            existingAttendance.late = punch.late;
            await existingAttendance.save();
            teacher.checkIn = true;
            await teacher.save();
            const lateMessage = punch.late
                ? `Checked in late. On-time check-in ended at ${day.described.onTimeUntilLabel}`
                : "Check-In Marked Successfully";
            return res.status(200).json(ApiResponse({ newAttendance: existingAttendance, late: punch.late, rules }, lateMessage, true));
        }

        // Create new attendance record. The school clock decides late vs on time.
        const newAttendance = new Attendance({
            teacher,
            checkIn: now,
            status: "PRESENT",
            late: punch.late,
        });

        await newAttendance.save();

        // Update teacher check-in status
        teacher.checkIn = true;
        await teacher.save();

        const message = punch.late
            ? `Checked in late. On-time check-in ended at ${day.described.onTimeUntilLabel}`
            : "Check-In Marked Successfully";
        return res.status(200).json(ApiResponse({ newAttendance, late: punch.late, rules }, message, true));

    } catch (error) {
        return res.json(ApiResponse({}, errorHandler(error) ? errorHandler(error) : error.message, false));
    }
};

exports.markCheckOut = async (req, res) => {
  let teacher = await Teacher.findById(req.user._id);

  if (!teacher) {
    return res.json(ApiResponse({}, "Teacher Not Found", false));
  }

  try {
    const { rules, timeZone } = await loadTeacherRules();
    const now = new Date();
    const { resolveTeacherDay } = require("../../Helpers/teacherWorkDay");
    const day = await resolveTeacherDay(now, rules, timeZone);
    if (day.off) {
      const reason = day.reason === "holiday"
        ? "Teachers are off for this holiday"
        : "Teachers are off on the weekend";
      return res.status(400).json(ApiResponse({}, reason, false));
    }
    const { start, end } = schoolDayBounds(now, timeZone);

    // Find existing attendance for the school day
    let existingAttendance = await Attendance.findOne({
      teacher,
      checkIn: { $gte: start, $lte: end }
    });

    if (!existingAttendance || existingAttendance.status !== "PRESENT") {
      return res.status(400).json(ApiResponse({}, "Check-In not found for today", false));
    }

    // If already checked out, prevent duplicate check-out
    if (existingAttendance.checkOut) {
      return res.status(400).json(ApiResponse({}, "CheckOut Already Marked", false));
    }

    const punch = day.punch;
    if (!punch.checkoutOpen) {
      return res.status(400).json(ApiResponse({}, `Check-out opens at ${day.described.checkOutLabel}`, false));
    }

    // Update attendance record with the school clock, not the phone clock
    existingAttendance.checkOut = now;
    await existingAttendance.save();

    // Update teacher's checkOut status
    teacher.checkOut = true;
    await teacher.save();

    return res.status(200).json(ApiResponse({ existingAttendance }, "CheckOut Marked Successfully", true));
  } catch (error) {
    return res.json(ApiResponse({}, errorHandler(error) ? errorHandler(error) : error.message, false));
  }
};

exports.markLeave = async (req, res) => {
  let { leaveFrom, leaveTo, leaveType, leaveReason } = req.body;
  let teacher = await Teacher.findById(req.user._id);

  try {
    const { rules, timeZone } = await loadTeacherRules();
    const allowed = rules.leaveQuota[leaveType];
    if (allowed == null) {
      return res.status(400).json(ApiResponse({}, "Leave type is not available", false));
    }

    const fromParts = schoolParts(new Date(leaveFrom), timeZone);
    const toParts = schoolParts(new Date(leaveTo), timeZone);
    const startIndex = Date.UTC(fromParts.year, fromParts.month, fromParts.date);
    const endIndex = Date.UTC(toParts.year, toParts.month, toParts.date);
    const leaveDuration = Math.round((endIndex - startIndex) / 86400000) + 1;
    if (leaveDuration < 1) {
      return res.status(400).json(ApiResponse({}, "Invalid leave duration", false));
    }

    const rangeStart = zonedWallTime(fromParts.year, fromParts.month, fromParts.date, 0, 0, timeZone);
    const rangeEnd = new Date(
      zonedWallTime(toParts.year, toParts.month, toParts.date + 1, 0, 0, timeZone).getTime() - 1
    );
    const year = calendarYearBounds(rangeStart, timeZone);
    const used = await Attendance.countDocuments({
      teacher: teacher._id,
      leaveType,
      leaveStatus: { $in: ["PENDING", "APPROVED"] },
      checkIn: { $gte: year.start, $lte: year.end },
      $or: [
        { checkIn: { $lt: rangeStart } },
        { checkIn: { $gt: rangeEnd } },
      ],
    });
    if (!quotaAllows(used, leaveDuration, allowed)) {
      const left = Math.max(0, allowed - used);
      return res.status(400).json(
        ApiResponse({}, `Only ${left} ${leaveType.toLowerCase()} leave day${left === 1 ? "" : "s"} left this year`, false)
      );
    }
    
    let todayAttendance = null;
    const todayParts = schoolParts(new Date(), timeZone);
    
    // Loop through each school day of leave and mark attendance
    for (let i = 0; i < leaveDuration; i++) {
      const cursor = new Date(startIndex + i * 86400000);
      const yearNum = cursor.getUTCFullYear();
      const monthIndex = cursor.getUTCMonth();
      const dayNum = cursor.getUTCDate();
      const dayStart = zonedWallTime(yearNum, monthIndex, dayNum, 0, 0, timeZone);
      const dayEnd = new Date(zonedWallTime(yearNum, monthIndex, dayNum + 1, 0, 0, timeZone).getTime() - 1);

      let existingAttendance = await Attendance.findOne({
        teacher,
        checkIn: {
          $gte: dayStart,
          $lte: dayEnd
        }
      });

      if (existingAttendance && existingAttendance.status === "PRESENT") {
        return res.status(400).json(ApiResponse({}, "Cannot apply leave on a day that is already checked in", false));
      }

      let attendanceRecord;
      if (existingAttendance) {
        existingAttendance.leaveReason = leaveReason;
        existingAttendance.leaveType = leaveType;
        existingAttendance.leaveStatus = "PENDING";
        existingAttendance.status = "LEAVE";
        await existingAttendance.save();
        attendanceRecord = existingAttendance;
      } else {
        attendanceRecord = new Attendance({
          teacher,
          checkIn: dayStart,
          leaveType,
          leaveReason,
          leaveStatus: "PENDING",
          status: "LEAVE",
        });
        await attendanceRecord.save();
      }

      if (
        yearNum === todayParts.year &&
        monthIndex === todayParts.month &&
        dayNum === todayParts.date
      ) {
        todayAttendance = attendanceRecord;
      }
    }

    if (todayAttendance && teacher) {
      teacher.checkIn = true;
      await teacher.save();
    }

    return res.status(200).json(
      ApiResponse(
        { todayAttendance, rules },
        "Leave applied",
        true
      )
    );
  } catch (error) {
    return res.json(ApiResponse({}, errorHandler(error) ? errorHandler(error) : error.message, false));
  }
};

exports.getSchedule = async (req, res) => {
  try {
    const { rules, timeZone } = await loadTeacherRules();
    const now = new Date();
    const { resolveTeacherDay } = require("../../Helpers/teacherWorkDay");
    const day = await resolveTeacherDay(now, rules, timeZone);
    const punch = day.punch;
    const year = calendarYearBounds(now, timeZone);
    const usedRows = await Attendance.aggregate([
      {
        $match: {
          teacher: new mongoose.Types.ObjectId(String(req.user._id)),
          leaveStatus: { $in: ["PENDING", "APPROVED"] },
          checkIn: { $gte: year.start, $lte: year.end },
        },
      },
      { $group: { _id: "$leaveType", count: { $sum: 1 } } },
    ]);
    const used = { SICK: 0, CASUAL: 0, ANNUAL: 0 };
    usedRows.forEach((row) => {
      if (used[row._id] != null) used[row._id] = row.count;
    });
    const quota = {};
    Object.keys(rules.leaveQuota).forEach((key) => {
      const allowed = rules.leaveQuota[key];
      quota[key] = { allowed, used: used[key] || 0, remaining: Math.max(0, allowed - (used[key] || 0)) };
    });
    const { ensureTeacherAbsent } = require("../../Helpers/autoAbsent");
    const todayAttendance = await ensureTeacherAbsent(req.user._id, day, timeZone, now);
    return res.json(
      ApiResponse(
        {
          rules: { ...day.described, timeZone },
          timeZone,
          dayOff: day.off,
          dayOffReason: day.reason,
          dayOffName: day.off ? day.name : "",
          specialDay: day.special
            ? {
                name: day.name,
                checkInLabel: day.described.checkInLabel,
                checkOutLabel: day.described.checkOutLabel,
              }
            : null,
          lateIfNow: !day.off && punch.checkInOpen && punch.late,
          checkInOpen: punch.checkInOpen,
          checkoutOpen: punch.checkoutOpen,
          quota,
          todayAttendance,
        },
        "",
        true
      )
    );
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getAllMyAttendance = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    let {from,to} = req.query

    let finalAggregate = [
      {
        $match: {
          teacher: new mongoose.Types.ObjectId(String(req.user._id)),
        },
      },  
      {
        $sort: {
          checkIn: -1
        }
      }
      
    ];

    if (req.query) {
      if (req.query.keyword) {
        finalAggregate.push({
          $match: {
            $or: [
              {
                "teacher.firstName": {
                  $regex: ".*" + req.query.keyword.toLowerCase() + ".*",
                  $options: "i",
                },
              },
              {
                "teacher.lastName": {
                  $regex: ".*" + req.query.keyword.toLowerCase() + ".*",
                  $options: "i",
                },
              },
            ],
          },
        });
      }

      if (req.query.teacher) {
        finalAggregate.push({
          $match: {
            teacher: req.query.teacher,
          },
        });
      }


      if (from) {
        finalAggregate.push({
          $match: {
            checkIn: {
              $gte: moment(from).startOf("day").toDate(),
            },
          },
        });
      }

      if (to) {
        finalAggregate.push({
          $match: {
            checkIn: {
              $lte: moment(to).endOf("day").toDate(),
            },
          },
        });
      }

      if (req.query.status) {
        finalAggregate.push({
          $match: {
            status: req.query.status,
          },
        });
      }
    }

    const myAggregate =
      finalAggregate.length > 0
        ? Attendance.aggregate(finalAggregate)
        : Attendance.aggregate([]);

    Attendance.aggregatePaginate(myAggregate, { page, limit }).then(
      (attendance) => {
        res.json(ApiResponse(attendance));
      }
    ).catch((error) => {
      res.json(ApiResponse({}, error.message, false));
    });
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getAttendanceByMonth = async (req, res) => {
  try {
    let { month, year } = req.query;

    const { timeZone } = await loadTeacherRules();
    const schoolNow = schoolParts(new Date(), timeZone);

    if (!month) {
      month = schoolNow.month + 1;
    } else {
      month = parseInt(month);
    }

    if (!year) {
      year = schoolNow.year;
    } else {
      year = parseInt(year);
    }

    const { start: startOfMonth, end: endOfMonth } = schoolMonthBounds(year, month, timeZone);

    // Aggregate attendance statistics
    const attendanceStats = await Attendance.aggregate([
      {
        $match: {
          teacher: new mongoose.Types.ObjectId(String(req.user._id)),
          checkIn: { $gte: startOfMonth, $lte: endOfMonth }
        }
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    // Initialize stats object with default values
    let stats = { PRESENT: 0, ABSENT: 0, LEAVE: 0, HOLIDAY: 0 };

    // Map query results into stats object
    attendanceStats.forEach(stat => {
      stats[stat._id] = stat.count;
    });

    // Count holidays separately
    stats.HOLIDAY = await Attendance.countDocuments({
      teacher: req.user._id,
      checkIn: { $gte: startOfMonth, $lte: endOfMonth },
      status: "HOLIDAY"
    });

    // Fetch attendance records for the given month
    const attendance = await Attendance.find({
      teacher: req.user._id,
      checkIn: { $gte: startOfMonth, $lte: endOfMonth }
    });

    return res.status(200).json(
      ApiResponse({ attendance, stats, timeZone }, "Attendance fetched successfully", true)
    );

  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getMonthlyAttendanceStats = async (req, res) => {
  try {
    let { month, year } = req.query;

    const { timeZone } = await loadTeacherRules();
    const schoolNow = schoolParts(new Date(), timeZone);

    if (!month) {
      month = String(schoolNow.month + 1);
    }
    if (!year) {
      year = String(schoolNow.year);
    }

    const { start: startOfMonth, end: endOfMonth } = schoolMonthBounds(
      parseInt(year, 10),
      parseInt(month, 10),
      timeZone
    );

   // Aggregate to count status types
   const attendanceStats = await Attendance.aggregate([
    {
      $match: {
        teacher: new mongoose.Types.ObjectId(String(req.user._id)),
        checkIn: { $gte: startOfMonth, $lte: endOfMonth }
      }
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 }
      }
    }
  ]);

  // Convert the results to a more readable format
  let stats = {
    PRESENT: 0,
    ABSENT: 0,
    LEAVE: 0,
    HOLIDAY: 0 // Add holiday with default count 0
  };
  attendanceStats.forEach(stat => {
    stats[stat._id] = stat.count;
  });

  // If status is holiday, add it to the stats
  const holidayCount = await Attendance.countDocuments({
    teacher: req.user._id,
    checkIn: { $gte: startOfMonth, $lte: endOfMonth },
    status: "HOLIDAY"
  });

  stats["HOLIDAY"] = holidayCount;


  res.json(ApiResponse({stats}));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getAttendanceById = async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id);

    if (!attendance) {
      return res.json(ApiResponse({}, "Attendance not found", true));
    }

    return res.json(ApiResponse({ attendance }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

// exports.markLeave = async (req, res) => {
//   let { leaveFrom, leaveTo, leaveType, leaveReason } = req.body;
//   let teacher = await Teacher.findById(req.user._id);

//   try {
//     const startDate = moment(leaveFrom).startOf('day').subtract(1,'day');
//     const endDate = moment(leaveTo).endOf('day'); 

//     // Calculate the duration of leave in days
//     const leaveDuration = endDate.diff(startDate, 'days');

//     // If leave duration is less than 1, return an error
//     if (leaveDuration < 1) {
//       return res.status(400).json(ApiResponse({}, "Invalid leave duration", false));
//     }
    
//     let todayAttendance = null;
//     const today = moment().startOf("day");
    
//     // Loop through each day of leave and mark attendance
//     for (let i = 0; i < leaveDuration; i++) {
//       const currentDate = startDate.clone().add(i, 'days');
    
//       let existingAttendance = await Attendance.findOne({
//         teacher,
//         checkIn: {
//           $gte: currentDate.startOf('day').toDate(),
//           $lte: currentDate.endOf('day').toDate()
//         }
//       });
      
//       let attendanceRecord;
//       if (existingAttendance) {
//         existingAttendance.leaveReason = leaveReason;
//         existingAttendance.leaveType = leaveType;
//         existingAttendance.status = "LEAVE";
//         await existingAttendance.save();
//         attendanceRecord = existingAttendance;
//       } else {
//         const newAttendance = new Attendance({
//           teacher,
//           checkIn: currentDate.toDate(),
//           leaveType,
//           leaveReason,
//           status: "LEAVE"
//         });
//         await newAttendance.save();
//         attendanceRecord = newAttendance;
//       }
    
//       // Capture today's attendance
//       if (currentDate.isSame(today, "day")) {
//         todayAttendance = attendanceRecord;
//       }
      
//       // Update teacher's check-in status for current day
//       if (currentDate.isSame(moment(), 'day')) {
//         teacher.checkIn = true;
//         await teacher.save();
//       }
//     }

//     // Fetch updated monthly attendance stats
//     // let { month, year } = req.query;
//     // const currentDate = moment();

//     // if (!month) {
//     //   month = (currentDate.month() + 1).toString(); // Moment.js months are zero-based
//     // }
//     // if (!year) {
//     //   year = currentDate.year().toString();
//     // }

//     // Ensure month is two digits
//     // month = month.length === 1 ? `0${month}` : month;

//     // Construct date strings in ISO format (YYYY-MM-DD)
//     // const startOfMonth = moment(`${year}-${month}-01`).startOf("month").toDate();
//     // const endOfMonth = moment(`${year}-${month}-01`).endOf("month").toDate();

//     // const attendanceStats = await Attendance.aggregate([
//     //   {
//     //     $match: {
//     //       teacher: req.user._id,
//     //       checkIn: { $gte: startOfMonth, $lte: endOfMonth }
//     //     }
//     //   },
//     //   {
//     //     $group: {
//     //       _id: "$status",
//     //       count: { $sum: 1 }
//     //     }
//     //   }
//     // ]);

//     // let stats = {
//     //   PRESENT: 0,
//     //   ABSENT: 0,
//     //   LEAVE: 0,
//     //   HOLIDAY: 0
//     // };

//     // attendanceStats.forEach(stat => {
//     //   stats[stat._id] = stat.count;
//     // });

//     // const holidayCount = await Attendance.countDocuments({
//     //   teacher: req.user._id,
//     //   checkIn: { $gte: startOfMonth, $lte: endOfMonth },
//     //   status: "HOLIDAY"
//     // });

//     // stats["HOLIDAY"] = holidayCount;

//     return res.status(200).json(ApiResponse({ todayAttendance }, "Leave Marked Successfully", true));

//   } catch (error) {
//     return res.json(ApiResponse({}, errorHandler(error) ? errorHandler(error) : error.message, false));
//   }
// };

// exports.getAttendanceByMonth = async (req, res) => {
//   try {
//     let { month, year } = req.query;

//     const currentDate = moment();

//     if (!month) {
//       month = (currentDate.month() + 1).toString(); // Moment.js months are zero-based
//     }
//     if (!year) {
//       year = currentDate.year().toString();
//     }

//     // Ensure month is two digits
//     month = month.length === 1 ? `0${month}` : month;

//     // Construct date strings in ISO format (YYYY-MM-DD)
//     const startOfMonth = moment.utc(`${year}-${month}-01`).startOf("month").toDate();
//     const endOfMonth = moment.utc(`${year}-${month}-01`).endOf("month").toDate();
//   // Aggregate to count status types
//   const attendanceStats = await Attendance.aggregate([
//     {
//       $match: {
//         teacher: req.user._id,
//         checkIn: { $gte: startOfMonth, $lte: endOfMonth }
//       }
//     },
//     {
//       $group: {
//         _id: "$status",
//         count: { $sum: 1 }
//       }
//     }
//   ]);

//   // Convert the results to a more readable format
//   let stats = {
//     PRESENT: 0,
//     ABSENT: 0,
//     LEAVE: 0,
//     HOLIDAY: 0 // Add holiday with default count 0
//   };
//   attendanceStats.forEach(stat => {
//     stats[stat._id] = stat.count;
//   });

//   // If status is holiday, add it to the stats
//   const holidayCount = await Attendance.countDocuments({
//     teacher: req.user._id,
//     checkIn: { $gte: startOfMonth, $lte: endOfMonth },
//     status: "HOLIDAY"
//   });

//   stats["HOLIDAY"] = holidayCount;

//   const attendance = await Attendance.find({
//     teacher: req.user._id,
//     checkIn: { $gte: startOfMonth, $lte: endOfMonth },
//   });


//   res.json(ApiResponse({ attendance, stats }));
//   } catch (error) {
//     return res.json(ApiResponse({}, error.message, false));
//   }
// };
