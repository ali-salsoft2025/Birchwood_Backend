const express = require("express")
const {createChat,getMyChats} = require("../../Controllers/Chat");
const router = express.Router()
const { authenticatedRoute,adminRoute } = require("../../Middlewares/auth")
const { requireModule } = require("../../Middlewares/requireModule");
const { createChatValidator } = require("../../Validator/chatValidator")

router.post("/createChat",authenticatedRoute,requireModule("chat"),createChatValidator, createChat);
router.get("/getMyChats",authenticatedRoute,requireModule("chat"),getMyChats)

module.exports = router