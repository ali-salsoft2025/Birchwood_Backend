const Parent = require("../../Models/Parent");
const { generateToken, ApiResponse, generateRandom6DigitID, pick } = require("../../Helpers/index");
const { sendNotificationToAdmin } = require("../../Helpers/notification");
const sanitizeUser = require("../../Helpers/sanitizeUser");
const { assignParentImagesFromBody } = require("../../Helpers/parentImages");

const PARENT_SIGNUP_FIELDS = [
  "fatherFirstName",
  "fatherLastName",
  "motherFirstName",
  "motherLastName",
  "email",
  "phone",
  "password",
  "address",
  "city",
  "state",
  "image",
  "fatherImage",
  "motherImage",
];

exports.signup = async (req, res) => {
  const { email } = req.body;
  try {
    let parent = await Parent.findOne({ email });

    if (parent) {
      return res
        .status(400)
        .json(ApiResponse({}, "An account with this email already exists", false));
    }

    const parentId = generateRandom6DigitID("P");
    const payload = assignParentImagesFromBody(
      pick(req.body, PARENT_SIGNUP_FIELDS)
    );

    parent = new Parent({
      ...payload,
      parentId,
      isAdmin: false,
    });

    await parent.save();

    sendNotificationToAdmin(
      "New Account Signup",
      `A new user has signed up on the app. Email : ${email}`
    );

    return res.status(200).json(
      ApiResponse(
        { parent: sanitizeUser(parent) },
        "Account created successfully",
        true
      )
    );
  } catch (error) {
    return res.status(500).json(ApiResponse({}, "Something went wrong. Please try again.", false));
  }
};

exports.signin = async (req, res) => {
  let { email, password } = req.body;
  email = email.toLowerCase(); // Convert email to lowercase

  try {
    Parent.findOne({ email })
      .then((parent) => {
        if (!parent) {
          return res.json(
            ApiResponse({}, "No parent account found with this email", false)
          );
        }
        if (!parent.authenticate(password)) {
          return res.json(ApiResponse({}, "Incorrect password", false));
        }

        if (parent.status === "INACTIVE") {
          return res.json(
            ApiResponse({}, "Your account isn't active yet. Please wait for school approval.", false)
          );
        }

        const token = generateToken(parent);

        return res.json(
          ApiResponse(
            { parent: sanitizeUser(parent), token },
            "Signed in successfully",
            true
          )
        );
      })
      .catch((err) => {
        return res.json(ApiResponse({}, "Something went wrong. Please try again.", false));
      });
  } catch (error) {
    return res.status(500).json(ApiResponse({}, "Something went wrong. Please try again.", false));
  }
};
