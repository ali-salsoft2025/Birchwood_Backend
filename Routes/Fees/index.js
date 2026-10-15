const express = require("express");
const {
  createVoucher,
  previewMonth,
  sendMonth,
  getAllVouchers,
  getVoucherById,
  getAllChildVouchers,
  updateVoucher,
  submitProof,
  reviewVoucher,
  toggleStatus,
  deleteVoucher,
} = require("../../Controllers/Fees");
const router = express.Router();
const { authenticatedRoute, adminRoute } = require("../../Middlewares/auth");
const { requireModule } = require("../../Middlewares/requireModule");
const { uploadProof } = require("../../Middlewares/upload");
const { createVoucherValidator } = require("../../Validator/feesValidator");

router.post("/createVoucher", adminRoute, createVoucherValidator, createVoucher);
router.post("/previewMonth", adminRoute, previewMonth);
router.post("/sendMonth", adminRoute, sendMonth);
router.get("/getAllVouchers", adminRoute, getAllVouchers);
router.get("/getVoucherById/:id", authenticatedRoute, getVoucherById);
router.get("/getAllChildVouchers/:id", authenticatedRoute, requireModule("fees"), getAllChildVouchers);
router.post("/updateVoucher/:id", adminRoute, updateVoucher);
router.post("/submitProof/:id", authenticatedRoute, uploadProof, submitProof);
router.post("/review/:id", adminRoute, reviewVoucher);
router.get("/toggleStatus/:id", adminRoute, toggleStatus);
router.get("/deleteVoucher/:id", adminRoute, deleteVoucher);

module.exports = router;
