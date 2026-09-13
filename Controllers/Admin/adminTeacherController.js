const fs = require("fs");
const mongoose = require("mongoose");
const Teacher = require("../../Models/Teacher");
const TeacherAttendance = require("../../Models/TeacherAttendance");
const Classroom = require("../../Models/Classroom");
const moment = require("moment");
const { ApiResponse, pick, generateRandom6DigitID, generateString } = require("../../Helpers/index");
const { errorHandler } = require("../../Helpers/errorHandler");
const { sendNotificationToAdmin } = require("../../Helpers/notification");
const sanitizeUser = require("../../Helpers/sanitizeUser");
const { parseQueryList, parseObjectIdList, pushInMatch } = require("../../Helpers/queryList");

const TEACHER_CREATE_FIELDS = [
  "email",
  "teacherId",
  "firstName",
  "lastName",
  "phone",
  "address",
  "city",
  "state",
  "zip",
  "homeNumber",
  "image",
  "password",
  "classroom",
  "bio",
  "education",
  "employment",
  "dateOfBirth",
  "placeOfBirth",
  "status",
];

function parseMaybeJson(value, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function makeTeacherPassword() {
  return `Teacher@${generateString(5, false, true)}aA`;
}


//signup
exports.addTeacher = async (req, res) => {
  const { email } = req.body;
  try {
    let teacherId = req.body.teacherId || generateRandom6DigitID("T");
    let existing = await Teacher.findOne({
      $or: [{ email }, { teacherId }],
    });

    if (existing && existing.email === email) {
      return res
        .status(400)
        .json(ApiResponse({}, "Teacher with this email / Teacher ID already exist", false));
    }
    if (existing) {
      teacherId = generateRandom6DigitID("T");
    }

    const generatedPassword = req.body.password ? null : makeTeacherPassword();
    const payload = pick(
      {
        ...req.body,
        teacherId,
        password: req.body.password || generatedPassword,
      },
      TEACHER_CREATE_FIELDS
    );
    payload.education = parseMaybeJson(payload.education, []);
    payload.employment = parseMaybeJson(payload.employment, []);
    payload.status = payload.status === "ACTIVE" ? "ACTIVE" : "PENDING";

    const teacher = new Teacher(payload);
    await teacher.save();

    const title = "New Teacher Added";
    const content = `A new teacher has been added on the app. Email : ${email}`;
    sendNotificationToAdmin(title, content);

    return res.status(200).json(
      ApiResponse(
        {
          teacher: sanitizeUser(teacher),
          teacherId,
          password: generatedPassword || undefined,
        },
        "Teacher Added Successfully",
        true
      )
    );
  } catch (error) {
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};

//get all teachers
exports.getAllTeachers = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    let { keyword, from, to, status, classId, sort } = req.query;

    let finalAggregate = [
      {
        $sort: {
          createdAt: sort === "oldest" ? 1 : -1,
        },
      },
    ];

    if (keyword) {
      const regex = new RegExp(keyword.toLowerCase(), "i");
      finalAggregate.push({
        $match: {
          $or: [
            { firstName: { $regex: regex } },
            { lastName: { $regex: regex } },
            { email: { $regex: regex } },
          ],
        },
      });
    }

    if (status) {
      pushInMatch(finalAggregate, "status", parseQueryList(status));
    }

    pushInMatch(finalAggregate, "classroom", parseObjectIdList(classId));

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

    finalAggregate.push(
      {
        $lookup: {
          from: "classrooms",
          localField: "classroom",
          foreignField: "_id",
          as: "classroomInfo",
        },
      },
      {
        $unwind: {
          path: "$classroomInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          classroom: {
            $cond: [
              { $ifNull: ["$classroomInfo._id", false] },
              {
                _id: "$classroomInfo._id",
                classroomName: "$classroomInfo.classroomName",
                classroomId: "$classroomInfo.classroomId",
                color: "$classroomInfo.color",
              },
              "$classroom",
            ],
          },
        },
      },
      {
        $project: { classroomInfo: 0 },
      }
    );

    const myAggregate =
      finalAggregate.length > 0
        ? Teacher.aggregate(finalAggregate)
        : Teacher.aggregate([]);

        Teacher.aggregatePaginate(myAggregate, { page, limit }).then(
      (teachers) => {
        res.json(ApiResponse(teachers));
      }
    );
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

// Get Teacher by ID
exports.getTeacherById = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.params.id).populate("classroom");

    if (!teacher) {
      return res.json(ApiResponse({}, "Teacher not found", true));
    }

    return res.json(ApiResponse({ teacher }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};


// Update Teacher
exports.updateTeacher = async (req, res) => {
  try {
    if (req.body.image) {
      let currentTeacher = await Teacher.findById(req.params.id);

      if (currentTeacher.image) {
        const filePath = `./Uploads/${currentTeacher.image}`;

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`File '${filePath}' deleted.`);
        } else {
          console.log(`File '${filePath}' does not exist.`);
        }
      }
    }

    const updates = pick(req.body, TEACHER_CREATE_FIELDS.filter((field) => field !== "password"));
    updates.education = parseMaybeJson(updates.education, updates.education);
    updates.employment = parseMaybeJson(updates.employment, updates.employment);
    let teacher = await Teacher.findByIdAndUpdate(req.params.id, updates, {
      new: true,
    });

    if (!teacher) {
      return res.json(ApiResponse({}, "No teacher found", false));
    }

    return res.json(ApiResponse(sanitizeUser(teacher), "Teacher Profile updated successfully"));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};


// Delete Teacher
exports.deleteTeacher = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.params.id);

    if (!teacher) {
      return res.status(404).json(ApiResponse({}, "Teacher not found", false));
    }

    const assignedClass =
      (teacher.classroom && (await Classroom.findById(teacher.classroom))) ||
      (await Classroom.findOne({ teacher: teacher._id }));

    if (teacher.classroom || assignedClass) {
      const className = assignedClass?.classroomName || "a class";
      return res.status(400).json(
        ApiResponse(
          {},
          `Cannot delete this teacher while ${className} is assigned. Unassign the classroom first.`,
          false
        )
      );
    }

    await Teacher.findByIdAndDelete(teacher._id);

    if (teacher.image) {
      const filePath = `./Uploads/${teacher.image}`;
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    return res.json(ApiResponse({}, "Teacher Deleted Successfully", true));
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

exports.searchClassrooms = async (req, res) => {
  try {
    const { keyword } = req.query;
    const filter = { status: "ACTIVE" };
    if (keyword) {
      filter.$or = [
        { classroomName: { $regex: keyword, $options: "i" } },
        { classroomId: { $regex: keyword, $options: "i" } },
        { classroomGrade: { $regex: keyword, $options: "i" } },
      ];
    }
    const classrooms = await Classroom.find(filter)
      .select("_id classroomId classroomName classroomGrade classroomBatch status")
      .limit(keyword ? 50 : 20)
      .sort({ classroomName: 1 });
    return res.json(ApiResponse({ classrooms }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getTeacherAttendanceByMonth = async (req, res) => {
  try {
    let { month, year } = req.query;
    const now = moment.utc();
    month = parseInt(month || now.month() + 1, 10);
    year = parseInt(year || now.year(), 10);
    const startOfMonth = moment.utc({ year, month: month - 1, day: 1 }).startOf("month").toDate();
    const endOfMonth = moment.utc({ year, month: month - 1, day: 1 }).endOf("month").toDate();

    const attendance = await TeacherAttendance.find({
      teacher: req.params.id,
      checkIn: { $gte: startOfMonth, $lte: endOfMonth },
    }).sort({ checkIn: 1 });

    return res.json(ApiResponse({ attendance }, "Attendance fetched successfully", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.markAttendance = async (req, res) => {
  try {
    const { status, checkIn, checkOut, leaveReason } = req.body;
    const attendance = await TeacherAttendance.create({
      teacher: req.params.id,
      status: status || "PRESENT",
      checkIn: checkIn ? new Date(Number(checkIn) || checkIn) : new Date(),
      checkOut: checkOut ? new Date(Number(checkOut) || checkOut) : undefined,
      leaveReason: leaveReason || "",
    });
    return res.json(ApiResponse({ attendance }, "Attendance added successfully", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.updateAttendance = async (req, res) => {
  try {
    const { status, checkIn, checkOut, leaveReason } = req.body;
    const attendance = await TeacherAttendance.findByIdAndUpdate(
      req.params.id,
      {
        status,
        checkIn: checkIn ? new Date(Number(checkIn) || checkIn) : undefined,
        checkOut: checkOut ? new Date(Number(checkOut) || checkOut) : undefined,
        leaveReason,
      },
      { new: true }
    );
    if (!attendance) {
      return res.json(ApiResponse({}, "Attendance not found", false));
    }
    return res.json(ApiResponse({ attendance }, "Attendance updated successfully", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.deleteAttendance = async (req, res) => {
  try {
    const attendance = await TeacherAttendance.findByIdAndDelete(req.params.id);
    if (!attendance) {
      return res.json(ApiResponse({}, "Attendance not found", false));
    }
    return res.json(ApiResponse({}, "Attendance deleted successfully", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.resetTeacherPassword = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) {
      return res.status(404).json(ApiResponse({}, "Teacher not found", false));
    }

    const generated = req.body.password ? null : makeTeacherPassword();
    const password = req.body.password || generated;
    teacher.password = password;
    await teacher.save();

    return res.status(201).json(
      ApiResponse(
        { password: generated || undefined },
        "Teacher password updated successfully",
        true
      )
    );
  } catch (err) {
    return res.status(500).json(ApiResponse({}, err.toString(), false));
  }
};
