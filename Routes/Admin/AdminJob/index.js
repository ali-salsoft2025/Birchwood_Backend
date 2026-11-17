const express = require("express");
const router = express.Router();
const { adminRoute } = require("../../../Middlewares/auth");
const { listJobs, createJob, updateJob, deleteJob } = require("../../../Controllers/Admin/adminJobController");

router.get("/", adminRoute, listJobs);
router.post("/", adminRoute, createJob);
router.post("/:id", adminRoute, updateJob);
router.get("/delete/:id", adminRoute, deleteJob);

module.exports = router;
