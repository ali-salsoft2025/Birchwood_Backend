//Models
const Chat = require("../../Models/Chat")
const Message = require("../../Models/Message");

//Helpers
const { ApiResponse } = require("../../Helpers/index");

//create Message
exports.createMessage = async (req, res) => {
  const { senderType,content,chatId } = req.body;
  try {

    let chat = await Chat.findById(chatId)

    if(!chat){
        return res
        .json(ApiResponse({},  "Chat not Found",false));
    }


   const message = new Message({
    senderType,
    content,
    sender:req.user._id,
    chat:chatId
    });

    await message.save();

    
    chat.latestMessage = message._id;
    if (senderType === "teacher") {
      chat.parentUnread = (chat.parentUnread || 0) + 1;
      chat.unreadMessage = chat.parentUnread;
    } else if (senderType === "parent") {
      chat.teacherUnread = (chat.teacherUnread || 0) + 1;
    }
    await chat.save()


    return res.json(
        ApiResponse(
          { message },       
          "Message Created Successfully",
          true
        )
      );
  } catch (error) {
    return res.json(ApiResponse({}, error.message,false));
  }
};

exports.getChatMessages = async (req, res) => {
    const { chat } = req.params;
    const { page = 1, limit = 10 } = req.query; // Default to page 1 and limit 10

    try {
        const options = {
            page: parseInt(page),
            limit: parseInt(limit),
            sort: { createdAt: 'desc' }, // You can adjust the sorting as needed
            populate: 'sender',
        };

        const result = await Message.paginate({ chat }, options);

        // Opening the thread clears unread for this role
        if (chat && req.user?._id) {
          const role = req.userRole;
          if (role === "parent") {
            await Chat.findByIdAndUpdate(chat, {
              parentUnread: 0,
              unreadMessage: 0,
            });
          } else if (role === "teacher") {
            await Chat.findByIdAndUpdate(chat, { teacherUnread: 0 });
          }
        }

        return res.status(200).json(ApiResponse(result, 'Chat messages retrieved successfully', true));
    } catch (error) {
        return res.status(500).json(ApiResponse({}, error.message, false));
    }
};