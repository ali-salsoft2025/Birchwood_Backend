const express = require("express");
const {
  createVoucher,
  getAllVouchers,
  getVoucherById,
  getAllChildVouchers,
  updateVoucher,
  toggleStatus,
  deleteVoucher,
} = require("../../Controllers/Fees");
const router = express.Router();
const { authenticatedRoute, adminRoute } = require("../../Middlewares/auth");
const { requireModule } = require("../../Middlewares/requireModule");
const { createVoucherValidator } = require("../../Validator/feesValidator");

router.post("/createVoucher", adminRoute, createVoucherValidator, createVoucher);
router.get("/getAllVouchers", adminRoute, getAllVouchers);
router.get("/getVoucherById/:id", adminRoute, getVoucherById);
router.get("/getAllChildVouchers/:id", authenticatedRoute, requireModule("fees"), getAllChildVouchers);
router.post("/updateVoucher/:id", adminRoute, updateVoucher);
router.get("/toggleStatus/:id", adminRoute, toggleStatus);
router.get("/deleteVoucher/:id", adminRoute, deleteVoucher);

module.exports = router;
