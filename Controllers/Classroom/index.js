//Models
const Classroom = require("../../Models/Classroom");
const Teacher = require("../../Models/Teacher");
const Children = require("../../Models/Children");
const Timetable = require("../../Models/TimeTable");
const fs = require("fs");
const crypto = require("crypto");
const moment = require("moment");
//Helpers
const { generateToken } = require("../../Helpers/index");
const { ApiResponse } = require("../../Helpers/index");
const { validateToken } = require("../../Helpers/index");
const { generateString } = require("../../Helpers/index");
const { errorHandler } = require("../../Helpers/errorHandler");
const { resolveClassroomId, normalizeClassroomId } = require("../../Helpers/classroomId");
const {
  sendNotificationToAdmin,
  sendNotificationToUser,
} = require("../../Helpers/notification");
const sanitizeUser = require("../../Helpers/sanitizeUser");
const { parseQueryList, pushInMatch } = require("../../Helpers/queryList");
const {
  createResetToken,
  validateResetToken,
} = require("../../Helpers/verification");
const mongoose = require("mongoose");
const {
  assignTeacherToClassroom,
} = require("../../Helpers/classroomTeacherAssignment");

exports.addClassroom = async (req, res) => {
  const { classroomName, classroomGrade, classroomBatch, description, teacher, color, classroomId } = req.body;
  try {
    const existingclassroom = await Classroom.findOne({ classroomName });

    if (existingclassroom) {
      return res.json(ApiResponse({}, "Classroom with this name already Exists", false));
    }

    let resolvedClassroomId;
    try {
      resolvedClassroomId = await resolveClassroomId(Classroom, {
        classroomGrade,
        classroomName,
        classroomId: classroomId ? normalizeClassroomId(classroomId) : undefined,
      });
    } catch (idError) {
      return res.json(ApiResponse({}, idError.message, false));
    }

    const classroom = new Classroom({
      classroomId: resolvedClassroomId,
      classroomName,
      classroomGrade,
      classroomBatch,
      description,
      teacher,
      color,
    });

    await classroom.save();

    if (teacher) {
      await assignTeacherToClassroom(classroom._id, teacher);
    }

    const title = "New Classroom Created";
    const content = `A new Classroom has been created. Classroom name : ${classroomName}`;
    sendNotificationToAdmin(title, content);

    return res
      .status(200)
      .json(ApiResponse({ classroom }, "Classroom Created Successfully", true));
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

exports.getAllClassrooms = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;

    let finalAggregate = [
      {
        $sort: {
          createdAt: req.query.sort === "oldest" ? 1 : -1,
        },
      },
    {
      $lookup:{
        from:"teachers",
        localField:"teacher",
        foreignField:"_id",
        as:"teacher"
      }
    },
    {
      $unwind: {
          path: "$teacher",
          preserveNullAndEmptyArrays: true,
        },
    },
    {
      $lookup: {
        from: "childrens",
        localField: "_id",
        foreignField: "classroom",
        as: "students",
      },
    },
    {
      $addFields: {
        studentCount: { $size: { $ifNull: ["$students", []] } },
      },
    },
    {
      $project: {
        students: 0,
        "teacher.hashed_password": 0,
        "teacher.salt": 0,
        "teacher.tokens": 0,
      },
    }
    ];

    if (req.query.status) {
      pushInMatch(finalAggregate, "status", parseQueryList(req.query.status));
    }

    if(req.query.keyword){
      finalAggregate.push({
        $match:{
          $or:[
            { classroomName: { $regex: ".*" + req.query.keyword.toLowerCase() + ".*", $options: "i" } },
            { classroomId: { $regex: ".*" + req.query.keyword.toLowerCase() + ".*", $options: "i" } },
            { classroomGrade: { $regex: ".*" + req.query.keyword.toLowerCase() + ".*", $options: "i" } },
            { "teacher.firstName": { $regex: ".*" + req.query.keyword.toLowerCase() + ".*", $options: "i" } },
            { "teacher.lastName": { $regex: ".*" + req.query.keyword.toLowerCase() + ".*", $options: "i" } },
          ]}
        }
      );
    }

    if(req.query.teacher){
      finalAggregate.push({
        $match:{
          "teacher._id":new  mongoose.Types.ObjectId(req.query.teacher)
        }
      })



    }


    const myAggregate =
      finalAggregate.length > 0
        ? Classroom.aggregate(finalAggregate)
        : Classroom.aggregate([]);

    Classroom.aggregatePaginate(myAggregate, { page, limit }).then((classroomes) => {
      res.json(ApiResponse(classroomes));
    });
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

// Get classroom by ID
exports.getClassroomById = async (req, res) => {
  try {
    const classroom = await Classroom.findById(req.params.id)
      .populate("teacher", "firstName lastName email phone image teacherId status")
      .lean();

    if (!classroom) {
      return res.json(ApiResponse({}, "Classroom not found", true));
    }

    const students = await Children.find({ classroom: classroom._id })
      .select("firstName lastName rollNumber image status")
      .sort({ firstName: 1 })
      .lean();

    return res.json(ApiResponse({ classroom: { ...classroom, students } }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.searchTeachers = async (req, res) => {
  try {
    const { keyword } = req.query;

    //if not keyword return 10 students
    if (!keyword) {
      const teachers = await Teacher.find({status:"ACTIVE"}).limit(10);
      return res.json(ApiResponse({ teachers }, "", true));
    }

    const teachers = await Teacher.find({
        $and: [
    { status: "ACTIVE" },
    {
      $or: [
       { firstName: { $regex: keyword, $options: "i" } },
        { lastName: { $regex: keyword, $options: "i" } },
         { teacherId: { $regex: keyword, $options: "i" } },

      ],
    },
  ]
    });

    return res.json(ApiResponse({ teachers }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, errorHandler(error) ? errorHandler(error) : error.message, false));
  }
};




// Get classroom by ID
exports.updateClassroom = async (req, res) => {
  try {
    const previous = await Classroom.findById(req.params.id);
    if (!previous) {
      return res.json(ApiResponse({}, "No classroom found", false));
    }

    const hasTeacherField = Object.prototype.hasOwnProperty.call(req.body, "teacher");
    const nextTeacher = hasTeacherField
      ? req.body.teacher || null
      : undefined;

    if (hasTeacherField && nextTeacher) {
      const teacher = await Teacher.findById(nextTeacher);
      if (!teacher) {
        return res.json(ApiResponse({}, "No teacher found", false));
      }
    }

    const { teacher, classroomId, ...rest } = req.body;

    if (classroomId !== undefined) {
      try {
        rest.classroomId = await resolveClassroomId(Classroom, {
          classroomGrade: rest.classroomGrade || previous.classroomGrade,
          classroomName: rest.classroomName || previous.classroomName,
          classroomId: normalizeClassroomId(classroomId),
          excludeId: previous._id,
        });
      } catch (idError) {
        return res.json(ApiResponse({}, idError.message, false));
      }
    }

    let classroom = await Classroom.findByIdAndUpdate(req.params.id, rest, {
      new: true,
    });

    if (hasTeacherField) {
      classroom = await assignTeacherToClassroom(
        classroom._id,
        nextTeacher,
        previous.teacher
      );
    }

    return res.json(ApiResponse(classroom, "classroom updated successfully"));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

// Delete a classroom
exports.deleteClassroom = async (req, res) => {
  try {
    const classroom = await Classroom.findById(req.params.id);

    if (!classroom) {
      return res.status(404).json(ApiResponse({}, "Classroom not found", false));
    }

    const studentCount = await Children.countDocuments({ classroom: classroom._id });
    if (studentCount > 0) {
      return res.status(400).json(
        ApiResponse(
          {},
          "Cannot delete this class while students are assigned. Reassign or remove the students first.",
          false
        )
      );
    }

    await Timetable.deleteMany({ classroom: classroom._id });
    await Teacher.updateMany({ classroom: classroom._id }, { $unset: { classroom: 1 } });
    await Classroom.findByIdAndDelete(classroom._id);

    return res.json(ApiResponse({}, "Classroom Deleted Successfully", true));
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
