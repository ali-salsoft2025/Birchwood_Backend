const {
  DEFAULT_SCHOOL_TIME_ZONE,
  minutesNow,
  formatClock,
  schoolParts,
  zonedWallTime,
} = require("./schoolDay");

const CHECK_IN_LEAD_MINUTES = 60;

const DEFAULT_TEACHER_RULES = {
  checkInMinutes: 7 * 60,
  graceMinutes: 15,
  checkOutMinutes: 14 * 60,
  leaveQuota: { SICK: 8, CASUAL: 8, ANNUAL: 10 },
};

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeTeacherRules(raw = {}) {
  const quota = raw.leaveQuota || {};
  const checkInMinutes = clamp(raw.checkInMinutes, 0, 24 * 60 - 1, DEFAULT_TEACHER_RULES.checkInMinutes);
  const graceMinutes = clamp(raw.graceMinutes, 0, 180, DEFAULT_TEACHER_RULES.graceMinutes);
  const checkOutMinutes = clamp(raw.checkOutMinutes, 0, 24 * 60 - 1, DEFAULT_TEACHER_RULES.checkOutMinutes);
  return {
    checkInMinutes,
    graceMinutes,
    checkOutMinutes,
    onTimeUntilMinutes: Math.min(24 * 60 - 1, checkInMinutes + graceMinutes),
    checkInOpensMinutes: Math.max(0, checkInMinutes - CHECK_IN_LEAD_MINUTES),
    leaveQuota: {
      SICK: clamp(quota.SICK, 0, 365, DEFAULT_TEACHER_RULES.leaveQuota.SICK),
      CASUAL: clamp(quota.CASUAL, 0, 365, DEFAULT_TEACHER_RULES.leaveQuota.CASUAL),
      ANNUAL: clamp(quota.ANNUAL, 0, 365, DEFAULT_TEACHER_RULES.leaveQuota.ANNUAL),
    },
  };
}

function clockToMinutes(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesToClockInput(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function describeTeacherRules(rules) {
  const normalized = normalizeTeacherRules(rules);
  return {
    ...normalized,
    checkInLabel: formatClock(normalized.checkInMinutes),
    checkInOpensLabel: formatClock(normalized.checkInOpensMinutes),
    onTimeUntilLabel: formatClock(normalized.onTimeUntilMinutes),
    checkOutLabel: formatClock(normalized.checkOutMinutes),
    checkInClock: minutesToClockInput(normalized.checkInMinutes),
    checkOutClock: minutesToClockInput(normalized.checkOutMinutes),
  };
}

function punchState(date, rules, timeZone = DEFAULT_SCHOOL_TIME_ZONE) {
  const normalized = normalizeTeacherRules(rules);
  const minutes = minutesNow(date, timeZone);
  return {
    minutes,
    checkInOpen: minutes >= normalized.checkInOpensMinutes,
    late: minutes > normalized.onTimeUntilMinutes,
    checkoutOpen: minutes >= normalized.checkOutMinutes,
  };
}

function quotaAllows(used, days, limit) {
  const safeUsed = Math.max(0, Number(used) || 0);
  const safeDays = Math.max(0, Number(days) || 0);
  const safeLimit = Math.max(0, Number(limit) || 0);
  return safeUsed + safeDays <= safeLimit;
}

function calendarYearBounds(date = new Date(), timeZone = DEFAULT_SCHOOL_TIME_ZONE) {
  const parts = schoolParts(date, timeZone);
  const start = zonedWallTime(parts.year, 0, 1, 0, 0, parts.timeZone);
  const next = zonedWallTime(parts.year + 1, 0, 1, 0, 0, parts.timeZone);
  return { start, end: new Date(next.getTime() - 1), year: parts.year };
}

module.exports = {
  CHECK_IN_LEAD_MINUTES,
  DEFAULT_TEACHER_RULES,
  normalizeTeacherRules,
  clockToMinutes,
  minutesToClockInput,
  describeTeacherRules,
  punchState,
  quotaAllows,
  calendarYearBounds,
};
