//Models
const Chat = require("../../Models/Chat")
const Message = require("../../Models/Message");

//Helpers
const { ApiResponse } = require("../../Helpers/index");
const { emitChatMessage } = require("../../Helpers/socketEmitter");

function isChatMember(req, chat) {
  if (!chat || !req?.user?._id) return false;
  const userId = String(req.user._id);
  return String(chat.teacher) === userId || String(chat.parent) === userId;
}

function memberRole(req, chat) {
  if (String(chat.teacher) === String(req.user._id)) return "teacher";
  if (String(chat.parent) === String(req.user._id)) return "parent";
  return "";
}

//create Message
exports.createMessage = async (req, res) => {
  const { content,chatId } = req.body;
  try {

    let chat = await Chat.findById(chatId)

    if(!chat){
        return res
        .json(ApiResponse({},  "Chat not Found",false));
    }

    if (!isChatMember(req, chat)) {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }

    const senderType = memberRole(req, chat);

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

    const payload = message.toObject ? message.toObject() : message;
    emitChatMessage(String(chatId), payload, [chat.teacher, chat.parent]);

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
        const chatRoom = await Chat.findById(chat).select("teacher parent");
        if (!chatRoom) {
          return res.json(ApiResponse({}, "Chat not Found", false));
        }
        if (!isChatMember(req, chatRoom)) {
          return res.status(403).json(ApiResponse({}, "Access denied", false));
        }

        const options = {
            page: parseInt(page),
            limit: parseInt(limit),
            sort: { createdAt: 'desc' }, // You can adjust the sorting as needed
            populate: 'sender',
        };

        const result = await Message.paginate({ chat }, options);

        // Opening the thread clears unread for this role
        if (chat && req.user?._id) {
          const role = memberRole(req, chatRoom);
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