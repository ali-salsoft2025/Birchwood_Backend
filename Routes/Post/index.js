const express = require("express")
const {addPost,getAllPosts,getAllClassPosts,getAllChildPosts,getPostById,likePost,updatePost,commentPost,getAllPostComments,deletePost} = require("../../Controllers/Post")
const router = express.Router()
const { authenticatedRoute,adminRoute } = require("../../Middlewares/auth")
const {uploadMultiple} = require("../../Middlewares/upload")
const {addPostValidator,commentPostValidator} = require("../../Validator/postValidator")


router.post("/addPost",authenticatedRoute,uploadMultiple,addPostValidator,addPost)
router.get("/getAllPosts",authenticatedRoute,getAllPosts)
router.get("/getAllClassPosts/:id",authenticatedRoute,getAllClassPosts)
router.get("/getAllChildPosts/:id",authenticatedRoute,getAllChildPosts)
router.get("/getPostById/:id",authenticatedRoute,getPostById)
router.post("/updatePost/:id",authenticatedRoute,uploadMultiple,updatePost)
router.get("/deletePost/:id", authenticatedRoute, deletePost);
router.post("/likePost/:id", authenticatedRoute, likePost);
router.post("/commentPost/:id", authenticatedRoute,commentPostValidator, commentPost);
router.get("/getAllPostComments/:id", authenticatedRoute, getAllPostComments);
module.exports = router