const express = require("express");
const {
  addHoliday,
  getAllHolidays,
  updateHoliday,
  deleteHoliday,
} = require("../../Controllers/Holiday");
const router = express.Router();
const { authenticatedRoute, staffRoute } = require("../../Middlewares/auth");
const { addHolidayValidator } = require("../../Validator/holidayValidator");

router.post("/addHoliday", staffRoute, addHolidayValidator, addHoliday);
router.get("/getAllHolidays", authenticatedRoute, getAllHolidays);
router.post("/updateHoliday/:id", staffRoute, updateHoliday);
router.post("/deleteHoliday/:id", staffRoute, deleteHoliday);

module.exports = router;
