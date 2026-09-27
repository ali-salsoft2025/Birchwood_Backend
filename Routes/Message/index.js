const express = require("express")
const {createMessage,getChatMessages} = require("../../Controllers/Message");
const router = express.Router()
const { authenticatedRoute,adminRoute } = require("../../Middlewares/auth")
const { createMessageValidator } = require("../../Validator/messageValidator")

router.post("/createMessage",authenticatedRoute,createMessageValidator, createMessage);
router.get("/getChatMessages/:chat",authenticatedRoute,getChatMessages)

module.exports = router