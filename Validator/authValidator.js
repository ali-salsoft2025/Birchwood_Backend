const { body, validationResult, check } = require('express-validator');
const { ApiResponse } = require("../Helpers")


//signup Validator
exports.signupValidator = [
  check('email', "Email is required").not().isEmpty().isEmail().withMessage("Enter a valid email address"),
  body('fatherFirstName').not().isEmpty().withMessage("Father first name is required"),
  body('fatherLastName').not().isEmpty().withMessage("Father last name is required"),
  body('motherFirstName').not().isEmpty().withMessage("Mother first name is required"),
  body('motherLastName').not().isEmpty().withMessage("Mother last name is required"),
  body('phone').not().isEmpty().withMessage("Phone number is required"),
  body('password').not().isEmpty().withMessage("Password is required").isStrongPassword().withMessage("Password is too weak"),
  function (req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(ApiResponse({}, errors.array()[0].msg, false));
    }
    next()  
  }
]

//signin Validator
exports.signinValidator = [
  check('email', "Email is required").not().isEmpty().isEmail().withMessage("Enter a valid email address"),
  check('password', "Password is required").not().isEmpty().withMessage("Password is required"),
  function (req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(ApiResponse({}, errors.array()[0].msg, false));
    }
    next()
  }
]

//email code Validator
exports.emailCodeValidator = [
  check('email', "Email is required").not().isEmpty().isEmail().withMessage("Enter a valid email address"),
  function (req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(ApiResponse({}, errors.array()[0].msg, false));
    }
    next()
  }
]

//verify code Validator
exports.verifyCodeValidator = [
  check('email', "Email is required").not().isEmpty().isEmail().withMessage("Enter a valid email address"),
  check('code', "Verification code is required").not().isEmpty().isLength({ min: 4, max: 4   }).withMessage("Enter a valid 4-digit code"),
  function (req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(ApiResponse({}, errors.array()[0].msg, false));
    }
    next()
  }
]

//reset password Validator
exports.resetPasswordValidator = [
  check('email', "Email is required").not().isEmpty().isEmail().withMessage("Enter a valid email address"),
  check('password', "Password is required").not().isEmpty().isStrongPassword().withMessage("Password is too weak"),
  check('confirmPassword', "Confirm password is required").not().isEmpty().custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error("Passwords do not match");
    }
    return true;
  }),
  check('code', "Verification code is required").not().isEmpty().isLength({ min: 4, max: 4 }).withMessage("Enter a valid 4-digit code"),
  function (req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(ApiResponse({}, errors.array()[0].msg, false));
    }
    next()
  }
]

//admin signup Validator
exports.adminRegisterValidator = [
  check('email', "Email is required").not().isEmpty().isEmail().withMessage("Enter a valid email address"),
  body('firstName').not().isEmpty().withMessage("First Name is Required"),
  body('lastName').not().isEmpty().withMessage("Last Name is Required"),
  body('password').not().isEmpty().withMessage("Password is Required").isStrongPassword().withMessage("Password is too Weak"),
  function (req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(ApiResponse({}, errors.array()[0].msg, false));
    }
    next()
  }
]


//signup coach Validator
exports.teacherSignupValidator = [
  check('email', "Email is required").not().isEmpty().isEmail().withMessage("Enter a valid email address"),
  body('email').not().isEmpty().withMessage("Email is Required"),
  body('firstName').not().isEmpty().withMessage("First Name is Required"),
  body('lastName').not().isEmpty().withMessage("Last Name is Required"),
  body('phone').not().isEmpty().withMessage("Phone Number is Required"),
  body('address').not().isEmpty().withMessage("Address is Required"),
  body('state').not().isEmpty().withMessage("State is Required"),
  body('city').not().isEmpty().withMessage("City is Required"),
  body('bio').not().isEmpty().withMessage("Bio is Required"),
  body('password').not().isEmpty().withMessage("Password is Required").isStrongPassword().withMessage("Password is too Weak"),
  function (req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(ApiResponse({}, errors.array()[0].msg, false));
    }
    next()  
  }
]





//logout Validator
exports.logoutValidator = [
  body('token').not().isEmpty().withMessage("Token is Required"),
  function (req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(ApiResponse({}, errors.array()[0].msg, false));
    }
    next()  
  }
]