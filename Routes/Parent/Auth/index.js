const express = require("express");
const { signup, signin } = require("../../../Controllers/Parent/authController");
const { emailVerificationCode, verifyRecoverCode, resetPassword } = require("../../../Controllers/Auth");
const router = express.Router();
const {
  signupValidator,
  emailCodeValidator,
  verifyCodeValidator,
  resetPasswordValidator,
  signinValidator,
} = require("../../../Validator/authValidator");
const { authLimiter } = require("../../../Middlewares/rateLimit");
const { uploadParentImages } = require("../../../Middlewares/upload");

router.post("/signup", authLimiter, uploadParentImages, signupValidator, signup);
router.post("/signin", authLimiter, signinValidator, signin);
router.post("/emailVerificationCode", authLimiter, emailCodeValidator, emailVerificationCode);
router.post("/verifyRecoverCode", authLimiter, verifyCodeValidator, verifyRecoverCode);
router.post("/resetPassword", authLimiter, resetPasswordValidator, resetPassword);

module.exports = router;
