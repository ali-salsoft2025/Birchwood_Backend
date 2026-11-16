const rateLimit = require("express-rate-limit");
const { ApiResponse } = require("../Helpers");

const publicReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests. Please wait a moment.",
});

const publicEnquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many enquiries. Please try again later.",
});

function publicReadOnly(req, res, next) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.set("Allow", "GET, HEAD");
    return res.status(405).json(ApiResponse({}, "This request is not allowed", false));
  }
  delete req.headers.authorization;
  delete req.headers.cookie;
  res.set("Cache-Control", "public, max-age=60");
  res.set("Referrer-Policy", "no-referrer");
  next();
}

function publicEnquiryGate(req, res, next) {
  delete req.headers.authorization;
  delete req.headers.cookie;
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
  next();
}

function allowQuery(names) {
  const allowed = new Set(names);
  return (req, res, next) => {
    const extra = Object.keys(req.query).filter((key) => !allowed.has(key));
    if (extra.length) {
      return res.status(400).json(ApiResponse({}, "This request is not allowed", false));
    }
    next();
  };
}

function readPage(req) {
  const pageRaw = req.query.page == null || req.query.page === "" ? "1" : String(req.query.page);
  const limitRaw = req.query.limit == null || req.query.limit === "" ? "12" : String(req.query.limit);
  if (!/^\d{1,3}$/.test(pageRaw) || !/^\d{1,2}$/.test(limitRaw)) return null;
  const page = Math.min(20, Math.max(1, Number(pageRaw)));
  const limit = Math.min(24, Math.max(1, Number(limitRaw)));
  return { page, limit, skip: (page - 1) * limit };
}

module.exports = {
  publicReadLimiter,
  publicEnquiryLimiter,
  publicReadOnly,
  publicEnquiryGate,
  allowQuery,
  readPage,
};
