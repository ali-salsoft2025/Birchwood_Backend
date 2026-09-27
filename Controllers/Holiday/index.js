//Models
const Holiday = require("../../Models/Holiday");
//Helpers
const { ApiResponse } = require("../../Helpers/index");
const { errorHandler } = require("../../Helpers/errorHandler");

const AUDIENCES = ["STUDENT", "TEACHER", "BOTH"];
const TYPES = ["HOLIDAY", "EVENT"];

function parseDate(value, label) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${label}`);
  }
  return parsed;
}

function normalizeHolidayPayload(body = {}) {
  const start = parseDate(body.date, "start date");
  if (!start) {
    throw new Error("Start date is required");
  }

  let end = body.endDate ? parseDate(body.endDate, "end date") : start;
  if (end < start) {
    end = start;
  }

  const audience = AUDIENCES.includes(body.audience) ? body.audience : "BOTH";
  const type = TYPES.includes(String(body.type || "").toUpperCase())
    ? String(body.type).toUpperCase()
    : "HOLIDAY";

  const payload = {
    name: String(body.name || "").trim(),
    date: start,
    audience,
    type,
    endDate: undefined,
  };

  if (!payload.name) {
    throw new Error("Holiday name is required");
  }

  if (end.getTime() !== start.getTime()) {
    payload.endDate = end;
  }

  return payload;
}

// Add Holiday
exports.addHoliday = async (req, res) => {
  try {
    const payload = normalizeHolidayPayload(req.body);
    payload.createdBy = req.user?._id;
    payload.createdByRole = req.userRole === "teacher" ? "teacher" : "admin";
    const newHoliday = new Holiday(payload);
    await newHoliday.save();

    return res
      .status(201)
      .json(ApiResponse({ newHoliday }, "Holiday Added Successfully", true));
  } catch (error) {
    const message = error.message || "Failed to add holiday";
    const status = message.includes("required") || message.includes("Invalid") ? 400 : 500;
    return res.status(status).json(
      ApiResponse({}, errorHandler(error) ? errorHandler(error) : message, false)
    );
  }
};

// Get All Holidays
exports.getAllHolidays = async (req, res) => {
  try {
    const holidays = await Holiday.find().sort({ date: 1 });
    res.set("Cache-Control", "no-store");

    return res.json(ApiResponse({ holidays }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

// Update Holiday
exports.updateHoliday = async (req, res) => {
  try {
    const holiday = await Holiday.findById(req.params.id);
    if (!holiday) {
      return res.json(ApiResponse({}, "No holiday found", false));
    }

    if (req.userRole === "teacher" && String(holiday.createdBy || "") !== String(req.user?._id || "")) {
      return res.status(403).json(ApiResponse({}, "You can only edit events you added", false));
    }

    const payload = normalizeHolidayPayload(req.body);
    holiday.name = payload.name;
    holiday.date = payload.date;
    holiday.audience = payload.audience;
    holiday.type = payload.type;
    holiday.endDate = payload.endDate;
    await holiday.save();

    return res.json(ApiResponse(holiday, "Holiday updated successfully", true));
  } catch (error) {
    const message = error.message || "Failed to update holiday";
    const status = message.includes("required") || message.includes("Invalid") ? 400 : 500;
    return res.status(status).json(ApiResponse({}, message, false));
  }
};

// Delete Holiday
exports.deleteHoliday = async (req, res) => {
  try {
    const holiday = await Holiday.findById(req.params.id);

    if (!holiday) {
      return res.json(ApiResponse({}, "Holiday not found", false));
    }

    if (req.userRole === "teacher" && String(holiday.createdBy || "") !== String(req.user?._id || "")) {
      return res.status(403).json(ApiResponse({}, "You can only delete events you added", false));
    }

    await holiday.deleteOne();

    return res.json(ApiResponse({}, "Deleted successfully", true));
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
