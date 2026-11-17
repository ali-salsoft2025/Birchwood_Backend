const Job = require("../../Models/Job");
const { ApiResponse } = require("../../Helpers");
const { cleanText, isObjectId } = require("../../Helpers/publicPayload");

const TYPES = new Set(["FULL_TIME", "PART_TIME", "CONTRACT"]);

function readJob(body, current = {}) {
  const title = cleanText(body.title, 120);
  const employmentType = TYPES.has(body.employmentType) ? body.employmentType : current.employmentType || "FULL_TIME";
  const status = body.status === "CLOSED" || body.status === "OPEN" ? body.status : current.status || "OPEN";
  let closingOn = current.closingOn || null;
  if (body.closingOn === "" || body.closingOn === null) {
    closingOn = null;
  } else if (body.closingOn) {
    const parsed = new Date(body.closingOn);
    if (Number.isNaN(parsed.getTime())) return { error: "Closing date is not valid" };
    closingOn = parsed;
  }
  return {
    title,
    department: cleanText(body.department ?? current.department, 80),
    employmentType,
    location: cleanText(body.location ?? current.location, 80) || "Campus",
    summary: cleanText(body.summary ?? current.summary, 280),
    description: cleanText(body.description ?? current.description, 4000),
    closingOn,
    status,
  };
}

exports.listJobs = async (req, res) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 }).limit(200).lean();
    return res.json(ApiResponse({ jobs }, "", true));
  } catch (error) {
    return res.status(500).json(ApiResponse({}, "Unable to load openings", false));
  }
};

exports.createJob = async (req, res) => {
  try {
    const next = readJob(req.body);
    if (next.error) return res.status(400).json(ApiResponse({}, next.error, false));
    if (!next.title) return res.status(400).json(ApiResponse({}, "Title is required", false));
    const job = await Job.create(next);
    return res.status(201).json(ApiResponse({ job }, "Opening added", true));
  } catch (error) {
    return res.status(500).json(ApiResponse({}, "Unable to add this opening", false));
  }
};

exports.updateJob = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json(ApiResponse({}, "Opening not found", false));
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json(ApiResponse({}, "Opening not found", false));
    const next = readJob(req.body, job);
    if (next.error) return res.status(400).json(ApiResponse({}, next.error, false));
    if (!next.title) return res.status(400).json(ApiResponse({}, "Title is required", false));
    Object.assign(job, next);
    await job.save();
    return res.json(ApiResponse({ job }, "Opening updated", true));
  } catch (error) {
    return res.status(500).json(ApiResponse({}, "Unable to update this opening", false));
  }
};

exports.deleteJob = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json(ApiResponse({}, "Opening not found", false));
    const job = await Job.findByIdAndDelete(req.params.id);
    if (!job) return res.status(404).json(ApiResponse({}, "Opening not found", false));
    return res.json(ApiResponse({}, "Opening deleted", true));
  } catch (error) {
    return res.status(500).json(ApiResponse({}, "Unable to delete this opening", false));
  }
};
