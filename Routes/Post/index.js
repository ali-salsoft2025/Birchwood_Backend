const express = require("express")
const {addPost,getAllPosts,getAllClassPosts,getAllChildPosts,getPostById,likePost,updatePost,commentPost,getAllPostComments,getPostLikes,deleteComment,removePostLike,deletePost} = require("../../Controllers/Post")
const router = express.Router()
const { authenticatedRoute,adminRoute } = require("../../Middlewares/auth")
const {uploadMultiple} = require("../../Middlewares/upload")
const {addPostValidator,commentPostValidator} = require("../../Validator/postValidator")
const {startPostVideo, chunkPostVideo, finishPostVideo, statusPostVideo, cancelPostVideo} = require("../../Controllers/Post/videoUpload")


router.post("/startVideo", authenticatedRoute, startPostVideo);
router.post(
  "/videoChunk",
  authenticatedRoute,
  express.raw({ type: "application/octet-stream", limit: "576kb" }),
  chunkPostVideo
);
router.post("/finishVideo", authenticatedRoute, finishPostVideo);
router.post("/cancelVideo", authenticatedRoute, cancelPostVideo);
router.get("/videoStatus/:uploadId", authenticatedRoute, statusPostVideo);
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
router.get("/getPostLikes/:id", authenticatedRoute, getPostLikes);
router.get("/deleteComment/:id", authenticatedRoute, deleteComment);
router.post("/removeLike/:id", adminRoute, removePostLike);
module.exports = router