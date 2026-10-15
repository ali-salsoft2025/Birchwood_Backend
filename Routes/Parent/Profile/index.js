const express = require("express");
const {
  getProfile,
  updateProfile,
  changePassword,
  getAllMyChildren,
  getChildProfileById,
  deleteAccount,
} = require("../../../Controllers/Parent/profileController");
const {
  assignChild,
  updateChildHealth,
  removeChild,
} = require("../../../Controllers/Children/childProfileController");
const router = express.Router();
const { authenticatedRoute } = require("../../../Middlewares/auth");
const { uploadFile, uploadParentImages } = require("../../../Middlewares/upload");
const { changePasswordValidator } = require("../../../Validator/profileValidator");
const { assignChildValidator } = require("../../../Validator/childValidator");
const { assignChildLimiter } = require("../../../Middlewares/rateLimit");

router.get("/getProfile", authenticatedRoute, getProfile);
router.post("/updateProfile", authenticatedRoute, uploadParentImages, updateProfile);
router.post(
  "/changePassword",
  authenticatedRoute,
  changePasswordValidator,
  changePassword
);
router.post(
  "/assignChild",
  authenticatedRoute,
  assignChildLimiter,
  assignChildValidator,
  assignChild
);
router.post("/removeChild", authenticatedRoute, removeChild);
router.delete("/deleteAccount", authenticatedRoute, deleteAccount);
router.post(
  "/updateChildHealth",
  authenticatedRoute,
  uploadFile,
  updateChildHealth
);
router.get("/getAllMyChildren", authenticatedRoute, getAllMyChildren);
router.get(
  "/getChildProfileById/:id",
  authenticatedRoute,
  getChildProfileById
);

module.exports = router;
