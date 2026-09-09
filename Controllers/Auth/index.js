//Models
const Teacher = require("../../Models/Teacher");
const Parent = require("../../Models/Parent");
const Admin = require("../../Models/Admin");
const Reset = require("../../Models/Reset");

//Helpers
const { ApiResponse } = require("../../Helpers/index");
const { generateString } = require("../../Helpers/index");
const { sendPasswordResetEmail } = require("../../Helpers/email");
const {
  createResetToken,
  validateResetToken,
} = require("../../Helpers/verification");

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

//email verification code
exports.emailVerificationCode = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);

    const parent = await Parent.findOne({ email });
    const teacher = await Teacher.findOne({ email });
    const admin = await Admin.findOne({ email });

    if (!parent && !teacher && !admin) {
      return res
        .status(400)
        .json(ApiResponse({}, "No account found with this email", false));
    }

    const verificationCode = generateString(4, false, true);
    await createResetToken(email, verificationCode);
    const encoded = Buffer.from(
      JSON.stringify({ email, code: verificationCode }),
      "ascii"
    ).toString("base64");
    const sent = await sendPasswordResetEmail(email, verificationCode);

    if (!sent) {
      return res
        .status(502)
        .json(
          ApiResponse(
            {},
            "Failed to send verification email. Please try again later.",
            false,
          ),
        );
    }
    res
      .status(201)
      .json(
        ApiResponse(
          { encodedEmail: encoded },
          "Recovery code has been emailed to your registered email address",
          true
        )
      );
  } catch (err) {
    res.status(500).json(ApiResponse({}, "Something went wrong. Please try again.", false));
  }
};

//verify recover code
exports.verifyRecoverCode = async (req, res) => {
  try {
    const { code, email: rawEmail } = req.body;
    const email = normalizeEmail(rawEmail);
    const isValidCode = await validateResetToken(code, email);

    if (isValidCode) {
      return res
        .status(200)
        .json(ApiResponse({}, "Code verified", true));
    } else
      return res
        .status(400)
        .json(ApiResponse({}, "Invalid or expired verification code", false));
  } catch (err) {
    res.status(500).json(ApiResponse({}, "Something went wrong. Please try again.", false));
  }
};

//reset password
exports.resetPassword = async (req, res) => {
  try {
    const { password, confirmPassword, code, email: rawEmail } = req.body;
    const email = normalizeEmail(rawEmail);

    if (confirmPassword && confirmPassword !== password) {
      return res
        .status(400)
        .json(ApiResponse({}, "Passwords do not match", false));
    }

    const reset_status = await validateResetToken(code, email);

    if (!reset_status) {
      return res
        .status(400)
        .json(ApiResponse({}, "This reset code does not match that email", false));
    }
    const parent = await Parent.findOne({ email });
    const teacher = await Teacher.findOne({ email });
    const admin = await Admin.findOne({ email });

    await Reset.deleteOne({ code: code, email: email });

    if (parent) {
      parent.password = password;
      await parent.save();
    } else if (teacher) {
      teacher.password = password;
      await teacher.save();
    } else if (admin) {
      admin.password = password;
      await admin.save();
    } else {
      return res
        .status(400)
        .json(ApiResponse({}, "No account found with this email", false));
    }
    await res
      .status(201)
      .json(ApiResponse({}, "Password updated successfully", true));
  } catch (err) {
    res.status(500).json(ApiResponse({}, "Something went wrong. Please try again.", false));
  }
};
