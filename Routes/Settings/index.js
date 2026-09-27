const express = require("express");
const { getModules, updateModules } = require("../../Controllers/Settings");
const { adminRoute, authenticatedRoute } = require("../../Middlewares/auth");

const router = express.Router();

router.get("/getModules", authenticatedRoute, getModules);
router.post("/updateModules", adminRoute, updateModules);

module.exports = router;
