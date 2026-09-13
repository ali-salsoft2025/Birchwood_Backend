const { body, validationResult } = require("express-validator");
const { ApiResponse } = require("../Helpers");

exports.addAdvertisementValidator = [
  body("title").not().isEmpty().withMessage("Title is required"),
  body("image").not().isEmpty().withMessage("Image is required"),
  function (req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(ApiResponse({}, errors.array()[0].msg, false));
    }
    next();
  },
];
