const express = require("express");
const {
  getProfile,
  updateProfile,
  changePassword,
  getAllMyChildren,
  getChildProfileById,
} = require("../../../Controllers/Parent/profileController");
const { assignChild } = require("../../../Controllers/Children/childProfileController");
const router = express.Router();
const { authenticatedRoute } = require("../../../Middlewares/auth");
const { uploadParentImages } = require("../../../Middlewares/upload");
const { changePasswordValidator } = require("../../../Validator/profileValidator");
const { assignChildValidator } = require("../../../Validator/childValidator");

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
  assignChildValidator,
  assignChild
);
router.get("/getAllMyChildren", authenticatedRoute, getAllMyChildren);
router.get(
  "/getChildProfileById/:id",
  authenticatedRoute,
  getChildProfileById
);

module.exports = router;
