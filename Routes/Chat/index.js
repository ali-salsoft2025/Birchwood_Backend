const express = require("express")
const {createChat,getMyChats,deleteChat} = require("../../Controllers/Chat");
const router = express.Router()
const { authenticatedRoute,adminRoute } = require("../../Middlewares/auth")
const { requireModule } = require("../../Middlewares/requireModule");
const { createChatValidator } = require("../../Validator/chatValidator")

router.post("/createChat",authenticatedRoute,requireModule("chat"),createChatValidator, createChat);
router.get("/getMyChats",authenticatedRoute,requireModule("chat"),getMyChats)
router.post("/deleteChat",authenticatedRoute,requireModule("chat"),deleteChat)

module.exports = router