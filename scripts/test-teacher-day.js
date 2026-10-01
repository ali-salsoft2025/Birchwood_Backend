const assert = require("assert");
const {
  normalizeTeacherRules,
  punchState,
  quotaAllows,
  clockToMinutes,
} = require("../Helpers/teacherDay");

const rules = normalizeTeacherRules({
  checkInMinutes: clockToMinutes("07:00"),
  graceMinutes: 15,
  checkOutMinutes: clockToMinutes("14:00"),
  leaveQuota: { SICK: 2, CASUAL: 1, ANNUAL: 3 },
});

function atKarachi(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  // 2026-09-24 is a Thursday. Karachi is UTC+5, so 07:00 PKT is 02:00 UTC.
  return new Date(Date.UTC(2026, 8, 24, hours - 5, minutes, 0));
}

let failed = 0;
function check(name, condition) {
  try {
    assert.strictEqual(condition, true);
    console.log("PASS", name);
  } catch (error) {
    failed += 1;
    console.error("FAIL", name);
  }
}

check("midnight cannot check in", punchState(atKarachi("00:00"), rules).checkInOpen === false);
check("5:59 cannot check in", punchState(atKarachi("05:59"), rules).checkInOpen === false);
check("6:00 can check in and is on time", punchState(atKarachi("06:00"), rules).checkInOpen === true && punchState(atKarachi("06:00"), rules).late === false);
check("7:00 is on time", punchState(atKarachi("07:00"), rules).late === false && punchState(atKarachi("07:00"), rules).checkInOpen === true);
check("7:15 is still on time", punchState(atKarachi("07:15"), rules).late === false);
check("7:16 is late", punchState(atKarachi("07:16"), rules).late === true);
check("1:59 PM cannot check out", punchState(atKarachi("13:59"), rules).checkoutOpen === false);
check("2:00 PM can check out", punchState(atKarachi("14:00"), rules).checkoutOpen === true);
check("quota blocks a third sick day", quotaAllows(2, 1, rules.leaveQuota.SICK) === false);
check("quota allows the first casual day", quotaAllows(0, 1, rules.leaveQuota.CASUAL) === true);
check("on-time window label ends at 7:15", rules.onTimeUntilMinutes === 7 * 60 + 15);
check("check-in opens one hour earlier", rules.checkInOpensMinutes === 6 * 60);

const { schoolParts, zonedWallTime } = require("../Helpers/schoolDay");
const midnightPkt = new Date("2026-09-27T19:00:00.000Z");
const pkt = schoolParts(midnightPkt, "Asia/Karachi");
const london = schoolParts(midnightPkt, "Europe/London");
check("midnight in Karachi is 28 Sep 00:00", pkt.date === 28 && pkt.hours === 0 && pkt.minutes === 0);
check("the same instant in London is still 27 Sep 20:00", london.date === 27 && london.hours === 20);
check(
  "7:00 Karachi is 02:00 UTC",
  zonedWallTime(2026, 8, 28, 7, 0, "Asia/Karachi").toISOString() === "2026-09-28T02:00:00.000Z"
);
check(
  "7:00 London is 06:00 UTC",
  zonedWallTime(2026, 8, 28, 7, 0, "Europe/London").toISOString() === "2026-09-28T06:00:00.000Z"
);

if (failed) {
  process.exit(1);
}
console.log("teacher day rules ok");
