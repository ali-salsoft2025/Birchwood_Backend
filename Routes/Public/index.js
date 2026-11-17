const express = require("express");
const router = express.Router();
const {
  publicReadLimiter,
  publicEnquiryLimiter,
  publicReadOnly,
  publicEnquiryGate,
  allowQuery,
} = require("../../Middlewares/publicSite");
const {
  listGalleries,
  getGallery,
  listJobs,
  getJob,
  createEnquiry,
} = require("../../Controllers/Public");

router.post("/enquiry", publicEnquiryLimiter, publicEnquiryGate, createEnquiry);

router.use(publicReadLimiter, publicReadOnly);
router.get("/gallery", allowQuery(["page", "limit"]), listGalleries);
router.get("/gallery/:id", allowQuery([]), getGallery);
router.get("/jobs", allowQuery(["page", "limit"]), listJobs);
router.get("/jobs/:id", allowQuery([]), getJob);

module.exports = router;
