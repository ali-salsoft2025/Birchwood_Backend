const express = require("express")
const {createChat,getMyChats} = require("../../Controllers/Chat");
const router = express.Router()
const { authenticatedRoute,adminRoute } = require("../../Middlewares/auth")
const { createChatValidator } = require("../../Validator/chatValidator")

router.post("/createChat",authenticatedRoute,createChatValidator, createChat);
router.get("/getMyChats",authenticatedRoute,getMyChats)

module.exports = router