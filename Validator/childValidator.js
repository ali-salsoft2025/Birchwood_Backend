const { body, validationResult } = require("express-validator");
const { ApiResponse } = require("../Helpers");
const Classroom = require("../Models/Classroom");
const Parent = require("../Models/Parent");
const mongoose = require("mongoose");

async function assertObjectId(value, label) {
  if (!value) return true;
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return true;
}

const childFieldsValidator = [
  body("rollNumber").not().isEmpty().withMessage("Roll number is required"),
  body("firstName").not().isEmpty().withMessage("First name is required"),
  body("lastName").optional({ checkFalsy: true }),
  body("term").not().isEmpty().withMessage("Term is required"),
  body("birthday").not().isEmpty().withMessage("Birthday is required"),
  body("age").not().isEmpty().withMessage("Age is required"),
  body("allergies").optional({ checkFalsy: true }),
  body("fears").optional({ checkFalsy: true }),
  body("conditions").optional({ checkFalsy: true }),
  body("summary").optional({ checkFalsy: true }),
  body("status").optional().isIn(["ACTIVE", "INACTIVE"]).withMessage("Invalid status"),
  body("classroom")
    .optional({ checkFalsy: true })
    .custom(async (value) => {
      await assertObjectId(value, "classroom");
      const classroom = await Classroom.findById(value).select("_id");
      if (!classroom) throw new Error("Selected class was not found");
      return true;
    }),
  body("parent")
    .optional({ checkFalsy: true })
    .custom(async (value) => {
      await assertObjectId(value, "parent");
      const parent = await Parent.findById(value).select("_id");
      if (!parent) throw new Error("Selected parent was not found");
      return true;
    }),
];

/** Require a field only when the client sends it (full edit). Skip on partial updates like resign/assign parent. */
function requiredWhenPresent(field, message) {
  return body(field).custom((value, { req }) => {
    if (!Object.prototype.hasOwnProperty.call(req.body, field)) {
      return true;
    }
    if (value === undefined || value === null || String(value).trim() === "") {
      throw new Error(message);
    }
    return true;
  });
}

const childUpdateFieldsValidator = [
  requiredWhenPresent("rollNumber", "Roll number is required"),
  requiredWhenPresent("firstName", "First name is required"),
  body("lastName").optional({ checkFalsy: true }),
  requiredWhenPresent("term", "Term is required"),
  requiredWhenPresent("birthday", "Birthday is required"),
  requiredWhenPresent("age", "Age is required"),
  body("allergies").optional({ checkFalsy: true }),
  body("fears").optional({ checkFalsy: true }),
  body("conditions").optional({ checkFalsy: true }),
  body("summary").optional({ checkFalsy: true }),
  body("status").optional().isIn(["ACTIVE", "INACTIVE"]).withMessage("Invalid status"),
  body("classroom")
    .optional({ checkFalsy: true })
    .custom(async (value) => {
      await assertObjectId(value, "classroom");
      const classroom = await Classroom.findById(value).select("_id");
      if (!classroom) throw new Error("Selected class was not found");
      return true;
    }),
  body("parent")
    .optional({ checkFalsy: true })
    .custom(async (value) => {
      // Empty parent is allowed (resign / unassign).
      if (value === undefined || value === null || String(value).trim() === "") {
        return true;
      }
      await assertObjectId(value, "parent");
      const parent = await Parent.findById(value).select("_id");
      if (!parent) throw new Error("Selected parent was not found");
      return true;
    }),
];

exports.addChildValidator = [
  ...childFieldsValidator,
  body("image").not().isEmpty().withMessage("Student photo is required"),
  function (req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(ApiResponse({}, errors.array()[0].msg, false));
    }
    next();
  },
];

exports.updateChildValidator = [
  ...childUpdateFieldsValidator,
  function (req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(ApiResponse({}, errors.array()[0].msg, false));
    }
    next();
  },
];

exports.assignChildValidator = [
  body("rollNumber").custom((_, {req}) => {
    const roll = String(req.body.rollNumber || req.body.rollNo || "").trim();
    if (!roll) {
      throw new Error("Roll Number is Required");
    }
    req.body.rollNumber = roll;
    return true;
  }),
  body("birthday").custom((_, {req}) => {
    const raw = req.body.birthday || req.body.dob;
    if (!raw) {
      throw new Error("Birthday is Required");
    }
    req.body.birthday = raw;
    return true;
  }),
  function (req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(ApiResponse({}, errors.array()[0].msg, false));
    }
    next();
  },
];
