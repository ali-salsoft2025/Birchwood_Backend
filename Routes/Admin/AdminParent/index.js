const express = require("express");
const router = express.Router();
const { uploadParentImages } = require("../../../Middlewares/upload");
const { adminRoute } = require("../../../Middlewares/auth");
const {
  addParent,
  searchStudents,
  getAllParent,
  getParentById,
  resetParentPassword,
  updateParent,
  deleteParent,
  toggleStatus,
} = require("../../../Controllers/Admin/adminParentController");
const { addParentValidator, resetPasswordValidator } = require("../../../Validator/parentValidator");

router.post("/addParent", adminRoute, uploadParentImages, addParentValidator, addParent);
router.get("/searchStudents", adminRoute, searchStudents);
router.get("/getAllParent", adminRoute, getAllParent);
router.get("/getParentById/:id", adminRoute, getParentById);
router.post("/updateParent/:id", adminRoute, uploadParentImages, updateParent);
router.get("/toggleStatus/:id", adminRoute, toggleStatus);
router.get("/deleteParent/:id", adminRoute, deleteParent);
router.post("/resetParentPassword/:id", adminRoute, resetPasswordValidator, resetParentPassword);

module.exports = router;
