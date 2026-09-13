//Models
const Activity = require("../../Models/Activity");
const moment = require("moment");
const fs = require("fs")
//Helpers
const { generateToken } = require("../../Helpers/index");
const { ApiResponse } = require("../../Helpers/index");
const { validateToken } = require("../../Helpers/index");
const {generateRandom6DigitID} = require("../../Helpers")
const { generateString } = require("../../Helpers/index");
const { errorHandler } = require("../../Helpers/errorHandler");
const { generateEmail } = require("../../Helpers/email");
const {sendNotificationToUser, sendNotificationToAdmin} = require("../../Helpers/notification")
const sanitizeUser = require("../../Helpers/sanitizeUser");
const {
  createResetToken,
  validateResetToken,
} = require("../../Helpers/verification");
const { sendAdminActivityUpdatesToTeachers } = require("../../Helpers/sockets");
const { parseQueryList, pushInMatch } = require("../../Helpers/queryList");


//signup
exports.addActivity = async (req, res) => {
  // return;
  const {title} = req.body;
  try {
    let activity = await Activity.findOne({title});
    if (activity) {
      return res
        .status(400)
        .json(ApiResponse({}, "Activity with this title already exist", false));
    }

    activity = new Activity({
      ...req.body,
    });

    await activity.save();

    const title1 ="New Activity Added"
    const content1 = `A new activity has been added.`
    
    sendAdminActivityUpdatesToTeachers(activity)
    sendNotificationToAdmin(title1,content1)   

    return res
      .status(200)
      .json(ApiResponse({ activity }, "Activity Added Successfully", true));
  } catch (error) {
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};

//get all activitys
exports.getAllActivities = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    let { keyword, from, to, status } = req.query;

    let finalAggregate = [
      {
        $sort: {
          createdAt: 1,
        },
      },
    ];

    if (keyword) {
      const regex = new RegExp(keyword.toLowerCase(), "i");
      finalAggregate.push({
        $match: {
          $or: [{ title: { $regex: regex } }, { description: { $regex: regex } }],
        },
      });
    }

    if (status) {
      pushInMatch(finalAggregate, "status", parseQueryList(status));
    }

    if (from) {
      finalAggregate.push({
        $match: {
          createdAt: {
            $gte: moment(from).startOf("day").toDate(),
          },
        },
      });
    }

    if (to) {
      finalAggregate.push({
        $match: {
          createdAt: {
            $lte: moment(to).endOf("day").toDate(),
          },
        },
      });
    }

    const myAggregate =
      finalAggregate.length > 0
        ? Activity.aggregate(finalAggregate)
        : Activity.aggregate([]);

        Activity.aggregatePaginate(myAggregate, { page, limit }).then(
      (activitys) => {
        res.json(ApiResponse(activitys));
      }
    );
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

// Get Activity by ID
exports.getActivityById = async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id);

    if (!activity) {
      return res.json(ApiResponse({}, "Activity not found", true));
    }

    return res.json(ApiResponse({ activity }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};


// Update Activity
exports.updateActivity = async (req, res) => {
  try {
    if (req.body.image) {
      let currentActivity = await Activity.findById(req.params.id);

      if (currentActivity.image) {
        const filePath = `./Uploads/${currentActivity.image}`;

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`File '${filePath}' deleted.`);
        } else {
          console.log(`File '${filePath}' does not exist.`);
        }
      }
    }

    let activity = await Activity.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });

    if (!activity) {
      return res.json(ApiResponse({}, "No activity found", false));
    }
    
    sendAdminActivityUpdatesToTeachers(activity)

    return res.json(ApiResponse(activity, "Activity updated successfully"));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};


// Delete Activity
exports.deleteActivity = async (req, res) => {
  try {
    const activity = await Activity.findByIdAndRemove(req.params.id);

    if (!activity) {
      return res.json(ApiResponse({}, "Activity not found", false));
    }

    if (activity.image) {
      const filePath = `./Uploads/${activity.image}`;

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`File '${filePath}' deleted.`);
      } else {
        console.log(`File '${filePath}' does not exist.`);
      }
    }
    
    sendAdminActivityUpdatesToTeachers(activity)

    return res.json(ApiResponse({}, "Activity Deleted Successfully", true));
  } catch (error) {
    return res.json(
      ApiResponse(
        {},
        errorHandler(error) ? errorHandler(error) : error.message,
        false
      )
    );
  }
};
