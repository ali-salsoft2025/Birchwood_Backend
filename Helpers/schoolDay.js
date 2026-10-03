const DEFAULT_SCHOOL_TIME_ZONE = "Asia/Karachi";
const SCHOOL_OFFSET_MS = 5 * 60 * 60 * 1000;
const SCHOOL_START_MINUTES = 7 * 60;
const WINDOW_MINUTES = 60;
const DISMISSAL_MINUTES = 14 * 60;
const CHECKIN_OPEN_MINUTES = SCHOOL_START_MINUTES - WINDOW_MINUTES;
const CHECKIN_ON_TIME_END_MINUTES = SCHOOL_START_MINUTES + WINDOW_MINUTES;
const PICKUP_OPEN_MINUTES = DISMISSAL_MINUTES - WINDOW_MINUTES;
const PICKUP_AFTER_MINUTES = PICKUP_OPEN_MINUTES;

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function isValidTimeZone(value) {
  if (!value || typeof value !== "string") return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch (error) {
    return false;
  }
}

function schoolParts(date = new Date(), timeZone = DEFAULT_SCHOOL_TIME_ZONE) {
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_SCHOOL_TIME_ZONE;
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const bag = {};
  formatted.forEach((part) => {
    if (part.type !== "literal") bag[part.type] = part.value;
  });
  let hours = Number(bag.hour);
  if (hours === 24) hours = 0;
  return {
    year: Number(bag.year),
    month: Number(bag.month) - 1,
    date: Number(bag.day),
    weekday: WEEKDAYS[bag.weekday] ?? 0,
    hours,
    minutes: Number(bag.minute),
    seconds: Number(bag.second) || 0,
    timeZone: zone,
  };
}

function zonedWallTime(year, monthIndex, day, hour, minute, timeZone = DEFAULT_SCHOOL_TIME_ZONE) {
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_SCHOOL_TIME_ZONE;
  const wanted = Date.UTC(year, monthIndex, day, hour, minute, 0);
  let utc = wanted;
  for (let pass = 0; pass < 3; pass += 1) {
    const parts = schoolParts(new Date(utc), zone);
    const wallAsUtc = Date.UTC(parts.year, parts.month, parts.date, parts.hours, parts.minutes, parts.seconds);
    utc = wanted - (wallAsUtc - utc);
  }
  return new Date(utc);
}

function isSchoolWeekday(date = new Date(), timeZone = DEFAULT_SCHOOL_TIME_ZONE) {
  const { weekday } = schoolParts(date, timeZone);
  return weekday >= 1 && weekday <= 5;
}

function schoolDayBounds(date = new Date(), timeZone = DEFAULT_SCHOOL_TIME_ZONE) {
  const parts = schoolParts(date, timeZone);
  const start = zonedWallTime(parts.year, parts.month, parts.date, 0, 0, parts.timeZone);
  const next = zonedWallTime(parts.year, parts.month, parts.date + 1, 0, 0, parts.timeZone);
  return {
    start,
    end: new Date(next.getTime() - 1),
  };
}

function schoolMonthBounds(year, month, timeZone = DEFAULT_SCHOOL_TIME_ZONE) {
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_SCHOOL_TIME_ZONE;
  const start = zonedWallTime(year, month - 1, 1, 0, 0, zone);
  const next = zonedWallTime(year, month, 1, 0, 0, zone);
  return { start, end: new Date(next.getTime() - 1) };
}

function previousSchoolWeekday(date = new Date()) {
  const { start } = schoolDayBounds(date);
  let cursor = new Date(start.getTime() - 60 * 1000);
  while (!isSchoolWeekday(cursor)) {
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
  return cursor;
}

function minutesNow(date = new Date(), timeZone = DEFAULT_SCHOOL_TIME_ZONE) {
  const parts = schoolParts(date, timeZone);
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

function childDayView(record, date = new Date(), options = {}) {
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

  if (options.schoolClosed && status !== "PRESENT" && status !== "LEAVE") {
    return {
      ...base,
      todayStatus: "HOLIDAY",
      todayCheckIn: null,
      todayCheckOut: null,
      todayPrompt: null,
      attendanceDot: "none",
      checkInOpen: false,
      canLeave: false,
    };
  }

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

  if (status === "ABSENT" || (!status && window.late)) {
    return {
      ...base,
      todayStatus: "ABSENT",
      todayCheckIn: null,
      todayCheckOut: null,
      todayPrompt: window.checkInOpen ? "CHECKIN" : null,
      attendanceDot: "red",
      checkInOpen: window.checkInOpen,
      checkInLate: window.late,
      canLeave: true,
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

  return {
    ...base,
    todayStatus: "UNMARKED",
    todayCheckIn: null,
    todayCheckOut: null,
    todayPrompt: window.checkInOpen ? "CHECKIN" : null,
    attendanceDot: "red",
    checkInOpen: window.checkInOpen,
    checkInLate: false,
    canLeave: true,
  };
}

module.exports = {
  DEFAULT_SCHOOL_TIME_ZONE,
  SCHOOL_OFFSET_MS,
  isValidTimeZone,
  zonedWallTime,
  schoolMonthBounds,
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
