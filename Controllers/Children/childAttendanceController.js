//Models
const Children = require("../../Models/Children");
const Attendance = require("../../Models/Attendance");
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
const { childCheckinNotification, childLeaveNotification } = require("../../Helpers/sockets");
const sanitizeUser = require("../../Helpers/sanitizeUser");
const {
  createResetToken,
  validateResetToken,
} = require("../../Helpers/verification");
const mongoose = require("mongoose");
const Teacher = require("../../Models/Teacher");
const Classroom = require("../../Models/Classroom");
const {
  childDayView,
  isSchoolWeekday,
  schoolDayBounds,
  schoolMonthBounds,
  schoolParts,
  attendanceWindow,
  scheduleLabels,
} = require("../../Helpers/schoolDay");

async function ownsChild(req, child) {
  if (!child) return false;
  if (req.userRole === "parent") {
    return child.parent && String(child.parent) === String(req.user._id);
  }
  if (req.userRole === "teacher") {
    const classroomId = child.classroom?._id || child.classroom;
    const classroom = child.classroom?.teacher
      ? child.classroom
      : await Classroom.findById(classroomId).select("teacher");
    return classroom?.teacher && String(classroom.teacher) === String(req.user._id);
  }
  return true;
}

async function attendanceForSchoolDay(childId, date = new Date()) {
  const { start, end } = schoolDayBounds(date);
  return Attendance.findOne({
    children: childId,
    checkIn: { $gte: start, $lte: end },
  });
}

exports.markCheckIn = async (req, res) => {
  try {
    const { children, markedBy } = req.body;
    const now = new Date();

    if (!isSchoolWeekday(now)) {
      return res.status(400).json(ApiResponse({}, "Check-in is only needed on school days", false));
    }

    const window = attendanceWindow(now);
    if (!window.checkInOpen) {
      const { checkInOpensLabel } = scheduleLabels();
      return res.status(400).json(ApiResponse({}, `Check-in opens at ${checkInOpensLabel}`, false));
    }

    const currentChild = await Children.findById(children).populate("classroom");
    if (!currentChild) {
      return res.status(404).json(ApiResponse({}, "Child Not Found", false));
    }
    if (!(await ownsChild(req, currentChild))) {
      return res.status(403).json(ApiResponse({}, "You can only mark students in your class", false));
    }

    const teacher = currentChild.classroom?.teacher;
    const parent = currentChild.parent;
    let attendance = await attendanceForSchoolDay(children, now);

    if (attendance?.status === "PRESENT") {
      return res.status(200).json(ApiResponse({
        newAttendance: attendance,
        ...childDayView(attendance, now),
      }, "Check-in already marked", true));
    }

    if (attendance) {
      attendance.status = "PRESENT";
      attendance.checkIn = now;
      attendance.markedBy = markedBy;
      attendance.leaveReason = "";
      attendance.checkOut = null;
      attendance.late = window.late;
      attendance.earlyPickup = false;
      attendance.pickupReason = "";
      await attendance.save();
    } else {
      attendance = await Attendance.create({
        children,
        checkIn: now,
        markedBy,
        status: "PRESENT",
        late: window.late,
        classroom: currentChild.classroom?._id || currentChild.classroom,
      });
    }

    currentChild.checkIn = true;
    await currentChild.save();
    childCheckinNotification(markedBy === "PARENT" ? teacher : parent, currentChild, attendance);

    return res.status(200).json(ApiResponse({
      newAttendance: attendance,
      ...childDayView(attendance, now),
    }, "Check-in Marked Successfully", true));
  } catch (error) {
    return res.status(500).json(ApiResponse({}, errorHandler(error) || error.message, false));
  }
};

exports.markCheckOut = async (req, res) => {
  try {
    const { children, markedBy, pickupReason } = req.body;
    const now = new Date();
    const reason = String(pickupReason || "").trim();

    if (!isSchoolWeekday(now)) {
      return res.status(400).json(ApiResponse({}, "Pickup is only needed on school days", false));
    }

    const currentChild = await Children.findById(children).populate("classroom");
    if (!currentChild) {
      return res.status(404).json(ApiResponse({}, "Child Not Found", false));
    }
    if (!(await ownsChild(req, currentChild))) {
      return res.status(403).json(ApiResponse({}, "You can only mark students in your class", false));
    }

    const attendance = await attendanceForSchoolDay(children, now);
    if (!attendance || attendance.status !== "PRESENT") {
      return res.status(400).json(ApiResponse({}, "Check in this child before marking pickup", false));
    }

    if (!attendance.checkOut) {
      const window = attendanceWindow(now);
      if (!window.pickupOpen && !reason) {
        const { pickupOpensLabel } = scheduleLabels();
        return res.status(400).json(
          ApiResponse({}, `Add a reason for pickup before ${pickupOpensLabel}`, false)
        );
      }
      attendance.checkOut = now;
      attendance.earlyPickup = !window.pickupOpen;
      attendance.pickupReason = window.pickupOpen ? "" : reason;
      if (markedBy) attendance.markedBy = markedBy;
      await attendance.save();
    }

    return res.status(200).json(ApiResponse({
      newAttendance: attendance,
      ...childDayView(attendance, now),
    }, "Pickup marked", true));
  } catch (error) {
    return res.status(500).json(ApiResponse({}, errorHandler(error) || error.message, false));
  }
};

exports.markLeave = async (req, res) => {
  try {
    let { checkIn, leaveReason, children, markedBy } = req.body;

    // Ensure checkIn is treated as UTC
    const startDate = moment.utc(checkIn).startOf("day");
    const endDate = moment.utc(checkIn).endOf("day");

    // Fetch the child with populated classroom and parent
    let currentChild = await Children.findById(children).populate("classroom")

    if (!currentChild) {
      return res.status(404).json(ApiResponse({}, "Child not found", false));
    }
    if (!(await ownsChild(req, currentChild))) {
      return res.status(403).json(ApiResponse({}, "You can only mark students in your class", false));
    }

    let teacher = currentChild.classroom?.teacher;
    let parent = currentChild.parent;

    const leaveMoment = moment.utc(checkIn);
    const schoolToday = schoolDayBounds(new Date());
    const isToday = leaveMoment.toDate() >= schoolToday.start && leaveMoment.toDate() <= schoolToday.end;
    const dayWindow = isToday
      ? schoolToday
      : { start: startDate.toDate(), end: endDate.toDate() };

    let existingAttendance = await Attendance.findOne({
      children,
      checkIn: {
        $gte: dayWindow.start,
        $lte: dayWindow.end,
      },
    });

    // Update child's check-in status only if marking leave for today
    const today = moment.utc().startOf("day");
    let todayAttendance = { checkIn };
    let attendanceRecord;

    if (existingAttendance) {
      // Update existing attendance record
      existingAttendance.leaveReason = leaveReason;
      existingAttendance.status = "LEAVE";
      if (isToday) {
        existingAttendance.checkIn = new Date();
        existingAttendance.checkOut = null;
      }
      await existingAttendance.save();
      attendanceRecord = existingAttendance;
    } else {
      // Create new attendance record
      attendanceRecord = new Attendance({
        children,
        checkIn,
        leaveReason,
        markedBy,
        status: "LEAVE",
      });
      await attendanceRecord.save();
    }

    if (isToday) {
      todayAttendance = attendanceRecord;
      currentChild.checkIn = false;
      await currentChild.save();
    }

    // Send notification
    childLeaveNotification(markedBy === "PARENT" ? teacher : parent, currentChild, todayAttendance);

    return res.status(200).json(ApiResponse({todayAttendance}, "Leave Marked Successfully", true));
  } catch (error) {
    return res.status(500).json(ApiResponse({}, errorHandler(error) || error.message, false));
  }
};

//get all Attendance
exports.getAllChildAttendance = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    let {from,to} = req.query

    let currentChild = await Children.findById(req.params.child).populate("classroom");

    if(!currentChild){
      return res.json(ApiResponse({}, "Child Not Found", false));
    }
    if (!(await ownsChild(req, currentChild))) {
      return res.status(403).json(ApiResponse({}, "You can only view students in your class", false));
    }

    let finalAggregate = [
      {
        $match: {
          children: new mongoose.Types.ObjectId(req.params.child),
        },
      },
      {
        $sort: {
          checkInDate: 1
        }
      }
      
    ];

    const myAggregate =
      finalAggregate.length > 0
        ? Attendance.aggregate(finalAggregate)
        : Attendance.aggregate([]);

    Attendance.aggregatePaginate(myAggregate, { page, limit }).then(
      (attendance) => {
        res.json(ApiResponse(attendance));
      }
    );
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

//get children Attendance By Month
exports.getAttendanceByMonth = async (req, res) => {  
  try {
    let { month, year } = req.query;

    const schoolNow = schoolParts(new Date());
    month = month ? parseInt(month, 10) : schoolNow.month + 1;
    year = year ? parseInt(year, 10) : schoolNow.year;

    const { start: startOfMonth, end: endOfMonth } = schoolMonthBounds(year, month);

    const currentChild = await Children.findById(req.params.child).populate("classroom");
    if (!currentChild) {
      return res.status(404).json(ApiResponse({}, "Child Not Found", false));
    }
    if (!(await ownsChild(req, currentChild))) {
      return res.status(403).json(ApiResponse({}, "You can only view students in your class", false));
    }

    const childId = new mongoose.Types.ObjectId(req.params.child);

    // Aggregate attendance statistics
    const attendanceStats = await Attendance.aggregate([
      {
        $match: {
          children: childId,
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

    // Convert the results to a readable format
    let stats = { PRESENT: 0, ABSENT: 0, LEAVE: 0, HOLIDAY: 0 };
    attendanceStats.forEach(stat => {
      stats[stat._id] = stat.count || 0;
    });

    // Count holidays separately
    stats.HOLIDAY = await Attendance.countDocuments({
      children: childId,
      checkIn: { $gte: startOfMonth, $lte: endOfMonth },
      status: "HOLIDAY"
    });

    // Fetch attendance records for the child
    const attendance = await Attendance.find({
      children: childId,
      checkIn: { $gte: startOfMonth, $lte: endOfMonth }
    }).sort({ checkInDate: -1 });

    res.json(ApiResponse({ attendance, stats }));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

//get children Attendance By Month
exports.getMonthlyAttendanceStats = async (req, res) => {  
  try {
    let { month, year } = req.query;

    const schoolNow = schoolParts(new Date());
    if (!month) {
      month = String(schoolNow.month + 1);
    }
    if (!year) {
      year = String(schoolNow.year);
    }

    const { start: startOfMonth, end: endOfMonth } = schoolMonthBounds(
      parseInt(year, 10),
      parseInt(month, 10)
    );
   
   const attendanceStats = await Attendance.aggregate([
    {
      $match: {
        children: new mongoose.Types.ObjectId(req.params.child),
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
    children: new mongoose.Types.ObjectId(req.params.child),
    checkIn: { $gte: startOfMonth, $lte: endOfMonth },
    status: "HOLIDAY"
  });

  stats["HOLIDAY"] = holidayCount;


  res.json(ApiResponse({stats }));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

// Get Attendance by ID
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

// exports.markCheckIn = async (req, res) => {
//     let {checkIn,children,markedBy} = req.body;
//     const startDate = moment(checkIn).startOf('day');
//     const endDate = moment(checkIn).endOf('day'); 

//     let currentChild = await Children.findById(children).populate("classroom")
//     let teacher = currentChild?.classroom?.teacher;
//     let parent = currentChild?.parent;

//     console.log(">>>>>>>>>>>>.",teacher,parent)
    
//     if(!currentChild){
//       return res.json(ApiResponse({}, "Child Not Found", false));
//     }

//     try {

//       const today = moment().startOf('day');
//       const attendanceDate = moment(checkIn).startOf('day');
    
//       if (!attendanceDate.isSame(today, 'day')) {
//         return res.status(400).json(ApiResponse({}, "Attendance Date should be today", false));
//       }


//       let existingAttendance = await Attendance.findOne({
//         children,
//         checkIn: {
//             $gte: startDate.toDate(), 
//             $lte: endDate.toDate()
//         }
//     });

//       if (existingAttendance) {
//         return res.status(500).json(ApiResponse({}, "CheckIn Already Marked", false));
//       }


//       const newAttendance = new Attendance({
//         children,
//         checkIn,
//         markedBy,
//         status:"PRESENT", 
//     });
//     await newAttendance.save();

//     currentChild.checkIn = true;
//     await currentChild.save()

//     childCheckinNotification(markedBy === "PARENT" ? teacher : parent ,currentChild,newAttendance)

//       // let title = "Child Checked In"
//       // let content = ` ${currentChild.firstName + " " + currentChild.lastName} has been checked in.`

//       // if (markedBy === "PARENT") {
//       //   if (teacher) {
//       //     sendNotificationToUser(teacher, title, content,type="NOTIFICATION",key="childCheckIn",currentChild._id)
//       //   }
//       // } else if (markedBy === "TEACHER") {
//       //   if (parent) {
//       //     sendNotificationToUser(parent, title, content,type="NOTIFICATION",key="childCheckIn",currentChild._id)
//       //   }
//       // }


//       return res.status(200).json(ApiResponse({ newAttendance }, "CheckIn Marked Successfully", true));
//     } catch (error) {
//       return res.json(ApiResponse({}, errorHandler(error) ? errorHandler(error) : error.message, false));
//     }
//   };

// exports.markLeave = async (req, res) => {
//   let {checkIn,leaveReason,children,markedBy} = req.body;
//   const startDate = moment(checkIn).startOf('day');
//   const endDate = moment(checkIn).endOf('day'); 

//   let currentChild = await Children.findById(children)
//   let teacher = currentChild?.classroom?.teacher;
//   let parent = currentChild?.parent;


//   try {


//     let existingAttendance = await Attendance.findOne({
//       children,
//       checkIn: {
//           $gte: startDate.toDate(), 
//           $lte: endDate.toDate()
//       }
//   });

//   const today = moment().startOf('day');
//   if (moment(checkIn).isSame(today, 'day')) {
//     currentChild.checkIn = true;
//     await currentChild.save();
//   }
  
//   if (existingAttendance) {
//     existingAttendance.leaveReason = leaveReason;
//     existingAttendance.status = "LEAVE";
//     await existingAttendance.save();

//     childLeaveNotification(markedBy === "PARENT" ? teacher : parent ,currentChild,existingAttendance)

//     return res.status(200).json(ApiResponse(existingAttendance, "Leave Marked Successfully", true));

//   } else {
//     const newAttendance = new Attendance({
//       children,
//       checkIn,
//       leaveReason,
//       markedBy,
//       status: "LEAVE"  
//     });
//     await newAttendance.save();
//     childLeaveNotification(markedBy === "PARENT" ? teacher : parent ,currentChild,newAttendance)


//     return res.status(200).json(ApiResponse(newAttendance, "Leave Marked Successfully", true));

//   }


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

// //   OLD CODE BY ALI
//     // const startOfMonth = moment(`${parseInt(year, 10)}-${parseInt(month, 10)}-01`, "YYYY-MM-DD").startOf("month").startOf('day').toDate();
//     // const endOfMonth = moment(`${parseInt(year, 10)}-${parseInt(month, 10)}-01`, "YYYY-MM-DD").endOf("month").endOf('day').toDate();

//     const startOfMonth = moment.utc(`${parseInt(year, 10)}-${parseInt(month, 10)}-01`, "YYYY-MM-DD").startOf("month").toDate();
//     const endOfMonth = moment.utc(`${parseInt(year, 10)}-${parseInt(month, 10)}-01`, "YYYY-MM-DD").endOf("month").toDate();
   
//   const attendanceStats = await Attendance.aggregate([
//     {
//       $match: {
//         children: new mongoose.Types.ObjectId(req.params.child),
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
//     children: new mongoose.Types.ObjectId(req.params.child),
//     checkIn: { $gte: startOfMonth, $lte: endOfMonth },
//     status: "HOLIDAY"
//   });

//   stats["HOLIDAY"] = holidayCount;

//   const attendance = await Attendance.find({
//     children: new mongoose.Types.ObjectId(req.params.child),
//     checkIn: { $gte: startOfMonth, $lte: endOfMonth },
//   }).sort({checkInDate:-1});


//   res.json(ApiResponse({ attendance, stats }));
//   } catch (error) {
//     return res.json(ApiResponse({}, error.message, false));
//   }
// };
