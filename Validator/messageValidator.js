const { body, validationResult } = require('express-validator');
const { ApiResponse } = require("../Helpers");

exports.createMessageValidator = [
  body('content').not().isEmpty().withMessage("Message content is Required"),
  body('chatId').not().isEmpty().withMessage("Chat ID is Required"),
  body('senderType').not().isEmpty().withMessage("Sender Type is Required"),
  body('senderType')
    .isIn(['parent', 'teacher'])
    .withMessage("Sender type must be either 'parent' or 'teacher'"),

  function (req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(ApiResponse({}, errors.array()[0].msg, false));
    }
    next();
  },
];
