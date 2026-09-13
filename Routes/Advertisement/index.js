const express = require("express");
const {
  addAdvertisement,
  getAllAdvertisements,
  getActiveAdvertisements,
  getAdvertisementById,
  updateAdvertisement,
  deleteAdvertisement,
} = require("../../Controllers/Advertisement/index");
const router = express.Router();
const { authenticatedRoute, adminRoute } = require("../../Middlewares/auth");
const { uploadFile } = require("../../Middlewares/upload");
const {
  addAdvertisementValidator,
} = require("../../Validator/advertisementValidator");

router.post(
  "/addAdvertisement",
  adminRoute,
  uploadFile,
  addAdvertisementValidator,
  addAdvertisement
);
router.get("/getAllAdvertisements", adminRoute, getAllAdvertisements);
router.get("/getActiveAdvertisements", authenticatedRoute, getActiveAdvertisements);
router.get("/getAdvertisementById/:id", adminRoute, getAdvertisementById);
router.post(
  "/updateAdvertisement/:id",
  adminRoute,
  uploadFile,
  updateAdvertisement
);
router.get("/deleteAdvertisement/:id", adminRoute, deleteAdvertisement);

module.exports = router;
