const SCHOOL_OFFSET_MS = 5 * 60 * 60 * 1000;
const SCHOOL_START_MINUTES = 7 * 60;
const WINDOW_MINUTES = 60;
const DISMISSAL_MINUTES = 14 * 60;
const CHECKIN_OPEN_MINUTES = SCHOOL_START_MINUTES - WINDOW_MINUTES;
const CHECKIN_ON_TIME_END_MINUTES = SCHOOL_START_MINUTES + WINDOW_MINUTES;
const PICKUP_OPEN_MINUTES = DISMISSAL_MINUTES - WINDOW_MINUTES;
const PICKUP_AFTER_MINUTES = PICKUP_OPEN_MINUTES;

function schoolParts(date = new Date()) {
  const shifted = new Date(date.getTime() + SCHOOL_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    date: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
  };
}

function isSchoolWeekday(date = new Date()) {
  const { weekday } = schoolParts(date);
  return weekday >= 1 && weekday <= 5;
}

function schoolDayBounds(date = new Date()) {
  const parts = schoolParts(date);
  const startMs = Date.UTC(parts.year, parts.month, parts.date) - SCHOOL_OFFSET_MS;
  return {
    start: new Date(startMs),
    end: new Date(startMs + 24 * 60 * 60 * 1000 - 1),
  };
}

function previousSchoolWeekday(date = new Date()) {
  const { start } = schoolDayBounds(date);
  let cursor = new Date(start.getTime() - 60 * 1000);
  while (!isSchoolWeekday(cursor)) {
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
  return cursor;
}

function minutesNow(date = new Date()) {
  const parts = schoolParts(date);
  return parts.hours * 60 + parts.minutes;
}

function formatClock(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 || 12;
  const minuteText = String(minutes).padStart(2, "0");
  return `${hour}:${minuteText} ${suffix}`;
}

function attendanceWindow(date = new Date()) {
  const minutes = minutesNow(date);
  return {
    minutes,
    checkInOpen: minutes >= CHECKIN_OPEN_MINUTES,
    onTime: minutes >= CHECKIN_OPEN_MINUTES && minutes <= CHECKIN_ON_TIME_END_MINUTES,
    late: minutes > CHECKIN_ON_TIME_END_MINUTES,
    pickupOpen: minutes >= PICKUP_OPEN_MINUTES,
  };
}

function scheduleLabels() {
  return {
    schoolStartLabel: formatClock(SCHOOL_START_MINUTES),
    checkInOpensLabel: formatClock(CHECKIN_OPEN_MINUTES),
    onTimeUntilLabel: formatClock(CHECKIN_ON_TIME_END_MINUTES),
    pickupOpensLabel: formatClock(PICKUP_OPEN_MINUTES),
    dismissalLabel: formatClock(DISMISSAL_MINUTES),
  };
}

function childDayView(record, date = new Date()) {
  const labels = scheduleLabels();
  const window = attendanceWindow(date);
  const base = {
    ...labels,
    checkInOpen: false,
    checkInLate: false,
    canLeave: false,
    earlyPickup: false,
    late: false,
    pickupReason: record?.pickupReason || "",
  };

  if (!isSchoolWeekday(date)) {
    return {
      ...base,
      todayStatus: "WEEKEND",
      todayCheckIn: null,
      todayCheckOut: null,
      todayPrompt: null,
      attendanceDot: "none",
    };
  }

  const status = record?.status || "";
  const checkIn = record?.checkIn || null;
  const checkOut = record?.checkOut || null;

  if (status === "LEAVE") {
    return {
      ...base,
      todayStatus: "LEAVE",
      todayCheckIn: checkIn,
      todayCheckOut: null,
      todayPrompt: null,
      attendanceDot: "blue",
    };
  }

  if (status === "PRESENT" && checkOut) {
    return {
      ...base,
      todayStatus: record?.earlyPickup ? "EARLY_PICKUP" : "PICKED_UP",
      todayCheckIn: checkIn,
      todayCheckOut: checkOut,
      todayPrompt: null,
      attendanceDot: "green",
      late: !!record?.late,
    };
  }

  if (status === "PRESENT") {
    const early = !window.pickupOpen;
    return {
      ...base,
      todayStatus: record?.late ? "LATE" : "PRESENT",
      todayCheckIn: checkIn,
      todayCheckOut: null,
      todayPrompt: early ? null : "PICKUP",
      attendanceDot: "green",
      late: !!record?.late,
      earlyPickup: early,
    };
  }

  const unmarked = status !== "ABSENT";
  return {
    ...base,
    todayStatus: status === "ABSENT" ? "ABSENT" : "UNMARKED",
    todayCheckIn: null,
    todayCheckOut: null,
    todayPrompt: window.checkInOpen && unmarked ? "CHECKIN" : null,
    attendanceDot: "red",
    checkInOpen: window.checkInOpen,
    checkInLate: window.late,
    canLeave: unmarked,
  };
}

module.exports = {
  SCHOOL_OFFSET_MS,
  SCHOOL_START_MINUTES,
  WINDOW_MINUTES,
  DISMISSAL_MINUTES,
  CHECKIN_OPEN_MINUTES,
  CHECKIN_ON_TIME_END_MINUTES,
  PICKUP_OPEN_MINUTES,
  PICKUP_AFTER_MINUTES,
  schoolParts,
  isSchoolWeekday,
  schoolDayBounds,
  previousSchoolWeekday,
  minutesNow,
  formatClock,
  attendanceWindow,
  scheduleLabels,
  childDayView,
};
