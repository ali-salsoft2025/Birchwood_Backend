const express = require("express")
const {createMessage,getChatMessages,deleteMessage,markChatRead} = require("../../Controllers/Message");
const {startAttachment, chunkAttachment, finishAttachment} = require("../../Controllers/Message/attachment");
const router = express.Router()
const { authenticatedRoute,adminRoute } = require("../../Middlewares/auth")
const { createMessageValidator } = require("../../Validator/messageValidator")

router.post("/createMessage",authenticatedRoute,createMessageValidator, createMessage);
router.get("/getChatMessages/:chat",authenticatedRoute,getChatMessages)
router.post("/deleteMessage",authenticatedRoute, deleteMessage);
router.post("/markChatRead", authenticatedRoute, markChatRead);
router.post("/startAttachment", authenticatedRoute, startAttachment);
router.post(
  "/attachmentChunk",
  authenticatedRoute,
  express.raw({ type: "application/octet-stream", limit: "64kb" }),
  chunkAttachment
);
router.post("/finishAttachment", authenticatedRoute, finishAttachment);

module.exports = router