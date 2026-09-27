//Models
const Timetable = require("../../Models/TimeTable");
const Classroom = require("../../Models/Classroom");
const moment = require("moment");
//Helpers
const { generateToken } = require("../../Helpers/index");
const { ApiResponse } = require("../../Helpers/index");
const { errorHandler } = require("../../Helpers/errorHandler");
const {
  sendNotificationToAdmin,
  sendNotificationToUser,
} = require("../../Helpers/notification");




const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI"];

async function canEditClassroom(req, classroomId) {
  if (!classroomId) return false;
  if (req.isAdmin || req.userRole === "admin") return true;
  if (req.userRole !== "teacher") return false;
  const room = await Classroom.findById(classroomId).select("teacher");
  return Boolean(room?.teacher && String(room.teacher) === String(req.user._id));
}

function weekdayKey(date) {
  return ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][moment(date, "YYYY-MM-DD").day()];
}

function mondayOf(date) {
  const value = moment(date, "YYYY-MM-DD");
  const shift = value.day() === 0 ? -6 : 1 - value.day();
  return value.clone().add(shift, "days");
}

function clockMinutes(value) {
  const text = String(value || "").trim();
  const ampm = text.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (ampm) {
    let hour = Number(ampm[1]) % 12;
    if (ampm[3].toLowerCase() === "pm") hour += 12;
    return hour * 60 + Number(ampm[2]);
  }
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function rangesOverlap(start, end, otherStart, otherEnd) {
  if ([start, end, otherStart, otherEnd].some((value) => value == null)) return false;
  return start < otherEnd && otherStart < end;
}

function findOverlap(slots, startTime, endTime, ignoreId) {
  const start = clockMinutes(startTime);
  const end = clockMinutes(endTime);
  return slots.find((item) => {
    if (ignoreId && String(item._id) === String(ignoreId)) return false;
    return rangesOverlap(start, end, clockMinutes(item.startTime), clockMinutes(item.endTime));
  });
}

function overlapMessage(slot) {
  const name = slot.subject || "Another slot";
  return `${name} already runs ${slot.startTime} – ${slot.endTime}`;
}

function sameDateLayer(item, onDate) {
  return (item.onDate || "") === (onDate || "");
}

function slotsForDate(slots, date) {
  const day = weekdayKey(date);
  const dated = slots.filter((item) => item.onDate === date);
  if (dated.length) return dated;
  return slots.filter((item) => item.day === day && !item.onDate);
}

// Add Timetable
exports.addTimetable = async (req, res) => {
  const { classroom, startTime, endTime, day, description, subject, meta, onDate } = req.body;
  
    try {
      if (!(await canEditClassroom(req, classroom))) {
        return res.status(403).json(ApiResponse({}, "You can only edit your own class timetable", false));
      }
      const start = clockMinutes(startTime);
      const end = clockMinutes(endTime);
      if (start == null || end == null || end <= start) {
        return res.status(400).json(ApiResponse({}, "End time has to be after the start time", false));
      }
      const peers = await Timetable.find({ classroom, day }).lean();
      const clash = findOverlap(
        peers.filter((item) => sameDateLayer(item, onDate)),
        startTime,
        endTime
      );
      if (clash) {
        return res.status(400).json(ApiResponse({}, overlapMessage(clash), false));
      }
      const newTimetable = new Timetable({
        classroom,
        day,
        startTime,
        endTime,
        description,
        subject,
        meta,
        onDate: onDate || "",
      });

      await newTimetable.save();

      return res
        .status(201)
        .json(
          ApiResponse({ newTimetable }, "Timetable Added Successfully", true)
        );
    } catch (error) {
      return res.json(
        ApiResponse(
          {},
          errorHandler(error) ? errorHandler(error) : error.message,
          false
        )
      );
    }
  };
  
  // Get All Timetables
  exports.getAllClassTimetables = async (req, res) => {
    const { classroom } = req.params; // Assuming the classroom is in the URL parameters
    const { day } = req.query; // Assuming day filter is in the query parameters

  try {
    const slots = await Timetable.find({ classroom }).sort({ startTime: 1 }).lean();
    const filtered = day ? slots.filter((item) => item.day === day) : slots;

    const byDay = filtered.reduce((groupedTimetables, timetable) => {
      const key = timetable.day;
      if (!groupedTimetables[key]) {
        groupedTimetables[key] = [];
      }
      groupedTimetables[key].push(timetable);
      return groupedTimetables;
    }, {});

    return res.json(ApiResponse({ slots: filtered, byDay }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
  };


  exports.getTimetableByDayAndClass = async (req, res) => {
  const { classroom, day } = req.query;

  try {
    const timetable = await Timetable.find({ classroom, day: day.toUpperCase() });

    return res.json(ApiResponse({ timetable }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};
  
  // Update Timetable
  exports.updateTimetable = async (req, res) => {
    try {
      const existing = await Timetable.findById(req.params.id);
      if (!existing) {
        return res.json(ApiResponse({}, "No timetable found", false));
      }
      if (!(await canEditClassroom(req, existing.classroom))) {
        return res.status(403).json(ApiResponse({}, "You can only edit your own class timetable", false));
      }
      const nextDay = req.body.day || existing.day;
      const nextStart = req.body.startTime || existing.startTime;
      const nextEnd = req.body.endTime || existing.endTime;
      const nextDate = req.body.onDate != null ? req.body.onDate : existing.onDate;
      const start = clockMinutes(nextStart);
      const end = clockMinutes(nextEnd);
      if (start == null || end == null || end <= start) {
        return res.status(400).json(ApiResponse({}, "End time has to be after the start time", false));
      }
      const peers = await Timetable.find({ classroom: existing.classroom, day: nextDay }).lean();
      const clash = findOverlap(
        peers.filter((item) => sameDateLayer(item, nextDate)),
        nextStart,
        nextEnd,
        existing._id
      );
      if (clash) {
        return res.status(400).json(ApiResponse({}, overlapMessage(clash), false));
      }
      const timetable = await Timetable.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
      });
  
      if (!timetable) {
        return res.json(ApiResponse({}, "No timetable found", false));
      }
  
      return res.json(ApiResponse(timetable, "Timetable updated successfully", true));
    } catch (error) {
      return res.json(ApiResponse({}, error.message, false));
    }
  };
  
  // Delete Timetable
  exports.deleteTimetable = async (req, res) => {
    try {
      const timetable = await Timetable.findById(req.params.id);
  
      if (!timetable) {
        return res.json(ApiResponse({}, "Timetable not found", false));
      }
      if (!(await canEditClassroom(req, timetable.classroom))) {
        return res.status(403).json(ApiResponse({}, "You can only edit your own class timetable", false));
      }
      await timetable.deleteOne();
  
      return res.json(ApiResponse({}, "Timetable Deleted Successfully", true));
    } catch (error) {
      return res.json(ApiResponse({}, errorHandler(error) ? errorHandler(error) : error.message, false));
    }
  };

exports.copyTimetable = async (req, res) => {
  try {
    const { classroom, mode, sourceDate, targetDate } = req.body || {};
    const source = String(sourceDate || "");
    const target = String(targetDate || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(source) || !/^\d{4}-\d{2}-\d{2}$/.test(target)) {
      return res.status(400).json(ApiResponse({}, "Choose a valid date to copy from", false));
    }
    if (mode !== "day" && mode !== "week") {
      return res.status(400).json(ApiResponse({}, "Choose a day or the whole week", false));
    }
    if (!(await canEditClassroom(req, classroom))) {
      return res.status(403).json(ApiResponse({}, "You can only edit your own class timetable", false));
    }
    if (source >= target && mode === "day") {
      return res.status(400).json(ApiResponse({}, "Copy from an earlier date", false));
    }

    const slots = await Timetable.find({ classroom }).lean();
    const pairs = [];
    if (mode === "day") {
      pairs.push([source, target]);
    } else {
      const sourceMonday = mondayOf(source);
      const targetMonday = mondayOf(target);
      if (!targetMonday.isAfter(sourceMonday, "day")) {
        return res.status(400).json(ApiResponse({}, "Copy from an earlier week", false));
      }
      for (let index = 0; index < 5; index += 1) {
        pairs.push([
          sourceMonday.clone().add(index, "days").format("YYYY-MM-DD"),
          targetMonday.clone().add(index, "days").format("YYYY-MM-DD"),
        ]);
      }
    }

    const created = [];
    let blocked = 0;
    for (const [fromDate, toDate] of pairs) {
      const day = weekdayKey(toDate);
      if (!WEEKDAYS.includes(day) || fromDate === toDate) continue;
      const sourceSlots = slotsForDate(slots, fromDate);
      const existing = slots.filter((item) => item.onDate === toDate);
      for (const slot of sourceSlots) {
        const already = existing.some(
          (item) =>
            item.startTime === slot.startTime &&
            item.endTime === slot.endTime &&
            (item.subject || "") === (slot.subject || "") &&
            (item.meta || "") === (slot.meta || "")
        );
        if (already) continue;
        if (findOverlap(existing, slot.startTime, slot.endTime)) {
          blocked += 1;
          continue;
        }
        const doc = await Timetable.create({
          classroom,
          day,
          onDate: toDate,
          startTime: slot.startTime,
          endTime: slot.endTime,
          description: slot.description || "",
          subject: slot.subject || "",
          meta: slot.meta || "",
        });
        const plain = doc.toObject();
        created.push(plain);
        existing.push(plain);
        slots.push(plain);
      }
    }

    if (!created.length && blocked) {
      return res
        .status(400)
        .json(ApiResponse({}, "Those times overlap slots already on this timetable", false));
    }
    const message = created.length
      ? blocked
        ? `Copied ${created.length} slot${created.length === 1 ? "" : "s"}. ${blocked} overlapped and were left out`
        : mode === "week"
          ? "Week copied onto these dates"
          : "Day copied onto this date"
      : "Those slots are already on this timetable";
    return res.json(ApiResponse({ count: created.length }, message, true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};
  