const { body, validationResult, check } = require('express-validator');
const { ApiResponse } = require("../Helpers")


exports.addPostValidator = [
    // Caption is optional — a photo or video alone is enough.
    body('content').optional({nullable: true}).isString().withMessage('Post content must be text'),
    body('type').not().isEmpty().withMessage('Type is required'),
    body('activity').not().isEmpty().withMessage('Activity is required'),
  
    // Custom validation for query parameters
    (req, res, next) => {
      if (typeof req.body.content !== 'string') {
        req.body.content = req.body.content == null ? '' : String(req.body.content);
      }
      const classroom = req.body.classroom;
      const child = req.body.children;
  
      // Check if both classroom and child are empty
      if (!classroom && !child) {
        return res.status(400).json(ApiResponse({}, 'Either Classroom or Child is required', false));
      }
      next();
    },
  
    // Middleware function to handle validation errors
    function (req, res, next) {
      const bodyErrors = validationResult(req);
  
      // Check for body validation errors
      if (!bodyErrors.isEmpty()) {
        return res.status(400).json(ApiResponse({}, bodyErrors.array()[0].msg, false));
      }
  
      // Proceed to the next middleware if validation passes
      next();
    }
  ];

  //signup Validator
exports.commentPostValidator = [
  body('content').not().isEmpty().withMessage("Comment Body is Required"),
  function (req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(ApiResponse({}, errors.array()[0].msg, false));
    }
    next()  
  }
] 