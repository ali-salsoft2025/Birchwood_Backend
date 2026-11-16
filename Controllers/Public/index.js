const Gallery = require("../../Models/Gallery");
const Job = require("../../Models/Job");
const Enquiry = require("../../Models/Enquiry");
const PROGRAMS = Enquiry.PROGRAMS;
const { ApiResponse } = require("../../Helpers");
const { generateEmail } = require("../../Helpers/email");
const { isObjectId, publicGallery, publicJob, jobIsOpen } = require("../../Helpers/publicPayload");
const { readPage } = require("../../Middlewares/publicSite");

function fail(res, status, message) {
  return res.status(status).json(ApiResponse({}, message, false));
}

function cleanText(value, max) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

exports.listGalleries = async (req, res) => {
  try {
    const page = readPage(req);
    if (!page) return fail(res, 400, "This request is not allowed");
    const filter = { status: "ACTIVE" };
    const [rows, total] = await Promise.all([
      Gallery.find(filter).sort({ createdAt: -1 }).skip(page.skip).limit(page.limit).lean(),
      Gallery.countDocuments(filter),
    ]);
    return res.json(
      ApiResponse(
        {
          galleries: rows.map(publicGallery).filter((album) => album.images.length),
          page: page.page,
          limit: page.limit,
          total,
        },
        "",
        true
      )
    );
  } catch (error) {
    return fail(res, 500, "Unable to load the gallery");
  }
};

exports.getGallery = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return fail(res, 404, "Album not found");
    const album = await Gallery.findOne({ _id: req.params.id, status: "ACTIVE" }).lean();
    if (!album) return fail(res, 404, "Album not found");
    const gallery = publicGallery(album);
    if (!gallery.images.length) return fail(res, 404, "Album not found");
    return res.json(ApiResponse({ gallery }, "", true));
  } catch (error) {
    return fail(res, 500, "Unable to load the gallery");
  }
};

exports.listJobs = async (req, res) => {
  try {
    const page = readPage(req);
    if (!page) return fail(res, 400, "This request is not allowed");
    const now = new Date();
    const filter = {
      status: "OPEN",
      $or: [{ closingOn: null }, { closingOn: { $exists: false } }, { closingOn: { $gte: now } }],
    };
    const [rows, total] = await Promise.all([
      Job.find(filter).sort({ createdAt: -1 }).skip(page.skip).limit(page.limit).lean(),
      Job.countDocuments(filter),
    ]);
    return res.json(
      ApiResponse(
        {
          jobs: rows.filter((row) => jobIsOpen(row, now)).map((row) => publicJob(row)),
          page: page.page,
          limit: page.limit,
          total,
        },
        "",
        true
      )
    );
  } catch (error) {
    return fail(res, 500, "Unable to load openings");
  }
};

exports.getJob = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return fail(res, 404, "Opening not found");
    const job = await Job.findById(req.params.id).lean();
    if (!jobIsOpen(job)) return fail(res, 404, "Opening not found");
    return res.json(ApiResponse({ job: publicJob(job, { includeDescription: true }) }, "", true));
  } catch (error) {
    return fail(res, 500, "Unable to load this opening");
  }
};

exports.createEnquiry = async (req, res) => {
  try {
    const body = req.body || {};
    // Honeypot for bots
    if (cleanText(body.website, 80)) {
      return res.json(ApiResponse({}, "Thank you. The office will be in touch soon.", true));
    }

    const parentName = cleanText(body.parentName, 80);
    const email = cleanText(body.email, 120).toLowerCase();
    const phone = cleanText(body.phone, 40);
    const childName = cleanText(body.childName, 80);
    const childAge = cleanText(body.childAge, 40);
    const program = cleanText(body.program, 40);
    const preferredVisit = cleanText(body.preferredVisit, 80);
    const message = cleanText(body.message, 1000);

    if (parentName.length < 2) return fail(res, 400, "Please enter your name");
    if (!isEmail(email)) return fail(res, 400, "Please enter a valid email");
    if (phone.length < 7) return fail(res, 400, "Please enter a phone number");
    if (!PROGRAMS.includes(program)) return fail(res, 400, "Please choose a program");
    if (message.length < 10) return fail(res, 400, "Please add a short message");

    const enquiry = await Enquiry.create({
      parentName,
      email,
      phone,
      childName,
      childAge,
      program,
      preferredVisit,
      message,
    });

    const to =
      process.env.ENQUIRY_TO ||
      process.env.MAIL_FROM_ADDRESS ||
      process.env.MAIL_USERNAME ||
      "info@thebirchwoodacademy.com";

    const subject = `Visit enquiry · ${program} · ${parentName}`;
    const text = [
      "New visit enquiry from the website",
      "",
      `Parent / guardian: ${parentName}`,
      `Email: ${email}`,
      `Phone: ${phone}`,
      `Child’s name: ${childName || "—"}`,
      `Child’s age: ${childAge}`,
      `Program: ${program}`,
      `Preferred visit: ${preferredVisit || "—"}`,
      "",
      "Message:",
      message,
      "",
      `Enquiry id: ${enquiry._id}`,
    ].join("\n");

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1c2740">
        <h2 style="margin:0 0 12px">New visit enquiry</h2>
        <p><strong>Parent / guardian:</strong> ${parentName}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Child’s name:</strong> ${childName || "—"}</p>
        <p><strong>Child’s age:</strong> ${childAge}</p>
        <p><strong>Program:</strong> ${program}</p>
        <p><strong>Preferred visit:</strong> ${preferredVisit || "—"}</p>
        <p><strong>Message:</strong><br/>${message.replace(/\n/g, "<br/>")}</p>
        <p style="color:#6b778c;font-size:12px">Enquiry id: ${enquiry._id}</p>
      </div>
    `;

    await generateEmail(to, subject, html, text);

    return res.status(201).json(
      ApiResponse({}, "Thank you. The office will be in touch soon.", true)
    );
  } catch (error) {
    return fail(res, 500, "Unable to send your enquiry right now");
  }
};
