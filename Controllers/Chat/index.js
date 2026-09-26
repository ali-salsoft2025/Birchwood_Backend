//Models
const Chat = require("../../Models/Chat")

//Helpers
const { ApiResponse } = require("../../Helpers/index");

const { default: mongoose } = require("mongoose");
const Teacher = require("../../Models/Teacher");
const Parent = require("../../Models/Parent");


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


    let chat = await Chat.findOne({ teacher: _teacher?._id, parent: _parent?._id ,children });

    if (chat) {
      return res.json(ApiResponse(chat, "Chat Between these Two users already exists", true));
    }

    chat = new Chat({
      teacher,parent,children,
      status:"ACTIVE"
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
            $unwind:"$children"
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
            $unwind:"$parent"
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
