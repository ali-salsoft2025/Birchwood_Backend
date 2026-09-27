const express = require("express");
const router = express.Router();
const { authenticatedRoute, adminRoute } = require("../../Middlewares/auth");
const { uploadGallery } = require("../../Middlewares/upload");
const {
  addGallery,
  updateGallery,
  deleteGallery,
  getAllGalleries,
  getActiveGalleries,
} = require("../../Controllers/Gallery");

router.post("/addGallery", adminRoute, uploadGallery, addGallery);
router.post("/updateGallery/:id", adminRoute, uploadGallery, updateGallery);
router.get("/deleteGallery/:id", adminRoute, deleteGallery);
router.get("/getAllGalleries", adminRoute, getAllGalleries);
router.get("/getActiveGalleries", authenticatedRoute, getActiveGalleries);

module.exports = router;
