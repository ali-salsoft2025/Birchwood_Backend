//Models
const Teacher = require("../../Models/Teacher");

//Helpers
const { generateToken } = require("../../Helpers/index");
const { ApiResponse } = require("../../Helpers/index");
const sanitizeUser = require("../../Helpers/sanitizeUser");

//signin
exports.signin = async (req, res) => {
  const { email, password } = req.body;

  try {
    Teacher.findOne({ email }).populate("classroom")
      .then((user) => {
        if (!user) {
          return res.json(
            ApiResponse({}, "Teacher with this email not found", false)
          );
        }
        if (!user.authenticate(password)) {
          return res.json(ApiResponse({}, "Invalid password!", false));
        }
        if (user.status == "PENDING") {
          return res.json(
            ApiResponse({}, "Account Still Pending Approval from Admin!", false)
          );
        }
        const token = generateToken(user);

        return res.json(
          ApiResponse(
            { user: sanitizeUser(user), token },
            "Teacher Logged In Successfully",
            true
          )
        );
      })
      .catch((err) => {
        return res.json(ApiResponse({}, err.message, false));
      });
  } catch (error) {
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};
