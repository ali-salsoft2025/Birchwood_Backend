const express = require("express");
const {
  createTicket,
  getAllTickets,
  getTicketById,
  updateTicket,
  deleteTicket,
  getTicketMessages,
  sendMessage,
  markTicketRead,
  getUnreadTicketCount,
  verifyTicketAccess,
} = require("../../Controllers/Support");
const { adminRoute, authenticatedRoute } = require("../../Middlewares/auth");

const router = express.Router();

router.post("/createTicket", authenticatedRoute, createTicket);
router.get("/getAllTickets", authenticatedRoute, getAllTickets);
router.get("/getUnreadTicketCount", authenticatedRoute, getUnreadTicketCount);
router.get("/getTicketById/:id", authenticatedRoute, getTicketById);
router.post("/updateTicket/:id", authenticatedRoute, updateTicket);
router.delete("/deleteTicket/:id", authenticatedRoute, deleteTicket);
router.get("/getTicketMessages/:id", authenticatedRoute, getTicketMessages);
router.post("/sendMessage/:id", authenticatedRoute, sendMessage);
router.post("/markTicketRead/:id", authenticatedRoute, markTicketRead);
router.get("/verifyTicketAccess/:id", authenticatedRoute, verifyTicketAccess);

module.exports = router;
