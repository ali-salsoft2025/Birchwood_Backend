const { body, validationResult } = require('express-validator');
const { ApiResponse } = require("../Helpers");

exports.createChatValidator = [
  body('teacher').not().isEmpty().withMessage("Teacher ID is Required"),
  body('parent').not().isEmpty().withMessage("Parent ID is Required"),

  function (req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(ApiResponse({}, errors.array()[0].msg, false));
    }
    next();
  },
];
