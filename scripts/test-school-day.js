const assert = require("assert");
const {
  isSchoolWeekday,
  schoolDayBounds,
  childDayView,
  previousSchoolWeekday,
  SCHOOL_START_MINUTES,
  CHECKIN_OPEN_MINUTES,
  PICKUP_OPEN_MINUTES,
  attendanceWindow,
} = require("../Helpers/schoolDay");

function at(iso) {
  return new Date(iso);
}

const week = [
  ["Monday", "2026-09-21T03:00:00.000Z"],
  ["Tuesday", "2026-09-22T03:00:00.000Z"],
  ["Wednesday", "2026-09-23T03:00:00.000Z"],
  ["Thursday", "2026-09-24T03:00:00.000Z"],
  ["Friday", "2026-09-25T03:00:00.000Z"],
];

let failed = 0;
function check(name, condition) {
  if (!condition) {
    failed += 1;
    console.error("FAIL", name);
    return;
  }
  console.log("PASS", name);
}

week.forEach(([label, iso]) => {
  const now = at(iso);
  check(`${label} is a school day`, isSchoolWeekday(now));
  const view = childDayView(null, now);
  check(`${label} unmarked child needs check-in`, view.todayPrompt === "CHECKIN" && view.attendanceDot === "red");
});

check("Saturday is not a school day", !isSchoolWeekday(at("2026-09-26T03:00:00.000Z")));
check("Sunday is not a school day", !isSchoolWeekday(at("2026-09-27T03:00:00.000Z")));
check(
  "weekend does not prompt",
  childDayView(null, at("2026-09-26T03:00:00.000Z")).todayPrompt === null
);

const present = { status: "PRESENT", checkIn: at("2026-09-24T03:10:00.000Z"), checkOut: null };
check(
  "present before pickup time stays green without a forced pickup",
  (() => {
    const view = childDayView(present, at("2026-09-24T04:00:00.000Z"));
    return view.attendanceDot === "green" && view.todayPrompt === null && view.todayStatus === "PRESENT";
  })()
);
check(
  "present after 2pm needs pickup",
  (() => {
    const view = childDayView(present, at("2026-09-24T09:30:00.000Z"));
    return view.todayPrompt === "PICKUP" && view.attendanceDot === "green";
  })()
);

const pickedUp = { ...present, checkOut: at("2026-09-24T09:40:00.000Z") };
check(
  "picked up child is done",
  childDayView(pickedUp, at("2026-09-24T10:00:00.000Z")).todayPrompt === null &&
    childDayView(pickedUp, at("2026-09-24T10:00:00.000Z")).todayStatus === "PICKED_UP"
);

const leave = { status: "LEAVE", checkIn: at("2026-09-24T03:00:00.000Z") };
check(
  "leave is blue and does not need pickup",
  (() => {
    const view = childDayView(leave, at("2026-09-24T10:00:00.000Z"));
    return view.attendanceDot === "blue" && view.todayPrompt === null;
  })()
);

const thursday = at("2026-09-24T03:00:00.000Z");
const bounds = schoolDayBounds(thursday);
check(
  "school day starts at midnight Karachi",
  bounds.start.toISOString() === "2026-09-23T19:00:00.000Z"
);
const fridayBounds = schoolDayBounds(at("2026-09-25T03:00:00.000Z"));
check(
  "midnight drops yesterday's check-in",
  present.checkIn < fridayBounds.start &&
    childDayView(null, at("2026-09-25T03:00:00.000Z")).todayPrompt === "CHECKIN"
);

const afterMidnight = at("2026-09-25T19:05:00.000Z");
check("Saturday midnight follows Friday", previousSchoolWeekday(afterMidnight).toISOString().startsWith("2026-09-25"));
check("school start is 7:00", SCHOOL_START_MINUTES === 420);
check("check-in opens at 6:00", CHECKIN_OPEN_MINUTES === 360);
check("pickup without a reason opens at 1:00", PICKUP_OPEN_MINUTES === 780);

const beforeOpen = at("2026-09-24T00:30:00.000Z");
check(
  "before 6:00 leave is allowed and check-in is closed",
  (() => {
    const view = childDayView(null, beforeOpen);
    return view.todayPrompt === null && view.canLeave === true && view.checkInOpen === false;
  })()
);
check("5:30 is outside the check-in window", attendanceWindow(beforeOpen).checkInOpen === false);

const onTime = at("2026-09-24T02:30:00.000Z");
check(
  "7:30 is an on-time check-in",
  attendanceWindow(onTime).onTime === true && childDayView(null, onTime).todayPrompt === "CHECKIN"
);

const lateMorning = at("2026-09-24T04:30:00.000Z");
check(
  "9:30 with no check-in is absent, and a check-in is still allowed as late",
  attendanceWindow(lateMorning).late === true &&
    childDayView(null, lateMorning).todayStatus === "ABSENT" &&
    childDayView(null, lateMorning).checkInLate === true &&
    childDayView(null, lateMorning).todayPrompt === "CHECKIN"
);
check(
  "a saved absent record can still be checked in",
  childDayView({ status: "ABSENT" }, lateMorning).todayPrompt === "CHECKIN" &&
    childDayView({ status: "ABSENT" }, lateMorning).todayStatus === "ABSENT"
);

const noon = at("2026-09-24T07:00:00.000Z");
check(
  "present at noon can leave early and is not forced to pick up",
  (() => {
    const view = childDayView(present, noon);
    return view.todayPrompt === null && view.earlyPickup === true;
  })()
);
check("1:00 opens normal pickup", attendanceWindow(at("2026-09-24T08:00:00.000Z")).pickupOpen === true);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll weekday check-in rules passed");
