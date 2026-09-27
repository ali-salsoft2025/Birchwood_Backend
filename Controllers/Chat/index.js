//Models
const Chat = require("../../Models/Chat")

//Helpers
const { ApiResponse } = require("../../Helpers/index");

const { default: mongoose } = require("mongoose");
const Teacher = require("../../Models/Teacher");
const Parent = require("../../Models/Parent");
const Children = require("../../Models/Children");
const Classroom = require("../../Models/Classroom");


//create Chat
exports.createChat = async (req, res) => {
  const { teacher,parent,children } = req.body;
  try {
    let _teacher = await Teacher.findById(teacher)

    if(!_teacher){
        return res
        .status(400)
        .json(ApiResponse({},  "Teacher not Found",false));
    }


    let _parent = await Parent.findById(parent)

    if(!_parent){
        return res.json(ApiResponse({},  "Parent not Found",false));
    }


    const childDoc = await Children.findById(children).select("parent classroom");
    if (!childDoc) {
      return res.status(400).json(ApiResponse({}, "Child not Found", false));
    }

    const room = childDoc.classroom
      ? await Classroom.findById(childDoc.classroom).select("teacher").lean()
      : null;
    const classTeacherId = room?.teacher ? String(room.teacher) : "";
    const childParentId = childDoc.parent ? String(childDoc.parent) : "";
    const callerId = String(req.user?._id || "");

    if (!classTeacherId || !childParentId) {
      return res.json(ApiResponse({}, "This student has no class teacher or parent", false));
    }

    if (req.userRole === "teacher" && callerId !== classTeacherId) {
      return res.status(403).json(ApiResponse({}, "You can only chat with parents in your class", false));
    }
    if (req.userRole === "parent" && callerId !== childParentId) {
      return res.status(403).json(ApiResponse({}, "You can only chat about your own child", false));
    }
    if (req.userRole !== "teacher" && req.userRole !== "parent" && !req.isAdmin) {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }

    const parentId = childParentId;
    _teacher = { _id: classTeacherId };

    let chat = await Chat.findOne({
      teacher: _teacher._id,
      children: childDoc._id,
    });

    if (chat) {
      if (parentId && String(chat.parent) !== String(parentId)) {
        chat.parent = parentId;
        await chat.save();
      }
      return res.json(ApiResponse(chat, "Chat Between these Two users already exists", true));
    }

    chat = new Chat({
      teacher: _teacher._id,
      parent: parentId,
      children: childDoc._id,
      status: "ACTIVE",
    });


    //populate the chat teacher
    // chat = await chat.populate("teacher");

    await chat.save();

    return res
      .status(200)
      .json(
        ApiResponse(
          chat,
          "Chat Created Successfully",
          true
        )
      );
  } catch (error) {
    return res.status(500).json(ApiResponse({}, error.message,false));
  }
};

//get all My chats
exports.getMyChats = async (req, res) => {
    const { type,keyword } = req.query;
    try {

      let finalAggregate = []


        if(type == "parent"){

          finalAggregate.push({
            $match: {parent: new mongoose.Types.ObjectId(req.user._id)}
          },
          {
            $lookup: {
              from: "teachers",
              localField: "teacher",
              foreignField: "_id",
              as: "teacher",
            },
          },{
            $unwind:"$teacher"
          },  {
            $lookup: {
              from: "childrens",
              localField: "children",
              foreignField: "_id",
              as: "children",
            },
          },{
            $unwind: {
              path: "$children",
              preserveNullAndEmptyArrays: true,
            },
          })

          if (keyword) {
            finalAggregate.push({
              $match: {
                $or: [
                  {
                    "teacher.firstName": {
                      $regex: ".*" + keyword.toLowerCase() + ".*",
                      $options: "i",
                    },
                  },
                  {
                    "teacher.lastName": {
                      $regex: ".*" + keyword.toLowerCase() + ".*",
                      $options: "i",
                    },
                  },
                ],
              },
            });
          }
        }else{

          finalAggregate.push({
            $match: {teacher: new mongoose.Types.ObjectId(req.user._id)}
          },
          {
            $lookup: {
              from: "parents",
              localField: "parent",
              foreignField: "_id",
              as: "parent",
            },
          },{
            $unwind: {
              path: "$parent",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $lookup: {
              from: "childrens",
              localField: "children",
              foreignField: "_id",
              as: "childInfo",
            },
          },
          {
            $addFields: {
              childName: {
                $trim: {
                  input: {
                    $concat: [
                      { $ifNull: [{ $arrayElemAt: ["$childInfo.firstName", 0] }, ""] },
                      " ",
                      { $ifNull: [{ $arrayElemAt: ["$childInfo.lastName", 0] }, ""] },
                    ],
                  },
                },
              },
            },
          })

          if (keyword) {
            finalAggregate.push({
              $match: {
                $or: [
                  {
                    "parent.firstName": {
                      $regex: ".*" + keyword.toLowerCase() + ".*",
                      $options: "i",
                    },
                  },
                  {
                    "parent.lastName": {
                      $regex: ".*" + keyword.toLowerCase() + ".*",
                      $options: "i",
                    },
                  },
                ],
              },
            });
          }
        }

        finalAggregate.push({
          $lookup: {
            from: "messages",
            localField: "latestMessage",
            foreignField: "_id",
            as: "latestMessage",
          },
        });
        
        finalAggregate.push({
          $unwind: {
            path: "$latestMessage",
            preserveNullAndEmptyArrays: true, // This will include documents without a latestMessage
          },
        });
       
    
        const myAggregate =
      finalAggregate.length > 0 ? Chat.aggregate(finalAggregate) : Chat.aggregate([]);

      const chats = await Chat.aggregatePaginate(myAggregate,{page:"1",limit:"100"});

      res.json(ApiResponse(chats));

    } catch (error) {
      return res.status(500).json(ApiResponse({}, error.message,false));
    }
  };
