//Models
const Chat = require("../../Models/Chat")
const Message = require("../../Models/Message");

//Helpers
const { ApiResponse } = require("../../Helpers/index");
const { emitChatMessage, emitChatMessageDeleted } = require("../../Helpers/socketEmitter");
const {
  purgeAttachmentIfOrphaned,
  removeUploadFile,
  clearAttachmentFields,
} = require("../../Helpers/chatAttachments");

const DELETE_FOR_EVERYONE_MS = 48 * 60 * 60 * 1000;

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

async function markChatReadFor(req, chat) {
  const role = memberRole(req, chat);
  if (role === "parent") {
    await Chat.findByIdAndUpdate(chat._id, {
      parentUnread: 0,
      unreadMessage: 0,
    });
  } else if (role === "teacher") {
    await Chat.findByIdAndUpdate(chat._id, { teacherUnread: 0 });
  }
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

    // Push first. The unread write must not hold the socket event.
    const payload = message.toObject ? message.toObject() : message;
    emitChatMessage(String(chatId), payload, [chat.teacher, chat.parent]);

    chat.latestMessage = message._id;
    chat.hiddenFor = (chat.hiddenFor || []).filter(
      (id) => String(id) !== String(chat.teacher) && String(id) !== String(chat.parent)
    );
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
        const chatRoom = await Chat.findById(chat).select("teacher parent clearedFor");
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

        const viewerId = String(req.user._id);
        const cleared = (chatRoom.clearedFor || []).find(
          (row) => row?.user && String(row.user) === viewerId
        );
        const messageQuery = {
          chat,
          deletedFor: { $nin: [req.user._id] },
        };
        if (cleared?.at) {
          messageQuery.createdAt = { $gt: cleared.at };
        }

        const result = await Message.paginate(messageQuery, options);
        result.docs = result.docs.map((doc) => {
          const plain = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
          if (plain.deletedForEveryone) {
            plain.content = "";
            plain.attachment = undefined;
          }
          delete plain.deletedFor;
          return plain;
        });

        if (chat && req.user?._id && chatRoom) {
          await markChatReadFor(req, chatRoom);
        }

        return res.status(200).json(ApiResponse(result, 'Chat messages retrieved successfully', true));
    } catch (error) {
        return res.status(500).json(ApiResponse({}, error.message, false));
    }
};

exports.markChatRead = async (req, res) => {
  const { chatId } = req.body || {};
  try {
    const chat = await Chat.findById(chatId).select("teacher parent");
    if (!chat) {
      return res.json(ApiResponse({}, "Chat not Found", false));
    }
    if (!isChatMember(req, chat)) {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }
    await markChatReadFor(req, chat);
    return res.json(ApiResponse({}, "Chat marked read", true));
  } catch (error) {
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};

exports.deleteMessage = async (req, res) => {
  const { messageId, scope } = req.body || {};
  try {
    if (scope !== "me" && scope !== "everyone") {
      return res.status(400).json(ApiResponse({}, "Choose delete for me or delete for everyone", false));
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.json(ApiResponse({}, "Message not found", false));
    }

    const chat = await Chat.findById(message.chat).select("teacher parent");
    if (!chat || !isChatMember(req, chat)) {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }

    const userId = String(req.user._id);

    if (scope === "everyone") {
      if (String(message.sender) !== userId) {
        return res.status(403).json(ApiResponse({}, "Only the sender can delete this for everyone", false));
      }
      const age = Date.now() - new Date(message.createdAt).getTime();
      if (age > DELETE_FOR_EVERYONE_MS) {
        return res.status(400).json(
          ApiResponse({}, "You can delete a message for everyone within 48 hours of sending it", false)
        );
      }
      const storedFile = message.attachment?.file;
      message.deletedForEveryone = true;
      message.content = "";
      message.attachment = clearAttachmentFields(message.attachment);
      message.attachment.name = "";
      message.attachment.mime = "";
      await message.save();
      if (storedFile) {
        await removeUploadFile(storedFile);
      }
      const payload = {
        _id: message._id,
        chat: message.chat,
        deletedForEveryone: true,
        content: "",
      };
      emitChatMessageDeleted(String(message.chat), payload, [chat.teacher, chat.parent]);
      return res.json(ApiResponse({ message: payload }, "Message deleted for everyone", true));
    }

    const already = (message.deletedFor || []).some((id) => String(id) === userId);
    if (!already) {
      message.deletedFor = message.deletedFor || [];
      message.deletedFor.push(req.user._id);
    }
    // If the other person already deleted it for themselves, drop the Uploads file too.
    const purged = await purgeAttachmentIfOrphaned(message, chat);
    await message.save();
    const payload = {
      _id: message._id,
      chat: message.chat,
      deletedForMe: true,
      attachmentPurged: purged,
    };
    emitChatMessageDeleted(String(message.chat), payload, [req.user._id]);
    return res.json(ApiResponse({ message: payload }, "Message deleted for you", true));
  } catch (error) {
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};