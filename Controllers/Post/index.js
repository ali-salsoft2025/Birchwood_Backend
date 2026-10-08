
//Models
const Post = require("../../Models/Post");
const Comment = require("../../Models/Comment");
const Children = require("../../Models/Children");
const moment = require("moment");
const fs = require("fs")
//Helpers
const { generateToken } = require("../../Helpers/index");
const { ApiResponse } = require("../../Helpers/index");
const { errorHandler } = require("../../Helpers/errorHandler");
const {
  sendNotificationToAdmin,
  sendNotificationToUser,
} = require("../../Helpers/notification");
const { sendCommentNotification, sendLikeAndLoveNotification } = require("../../Helpers/sockets");
const { assertPostModifyAccess, assertCanReadPost, canReadClassroom, postListMatch, assertCanAccessChild } = require("../../Helpers/accessControl");
const { parseQueryList, parseObjectIdList, pushInMatch } = require("../../Helpers/queryList");
const { claimPostVideos, listPostVideoNames } = require("./videoUpload");
const mongoose = require('mongoose');

function attachStreamedVideos(req, already = []) {
  let pending = [];
  try {
    pending = listPostVideoNames(req.body.streamedVideos);
  } catch (error) {
    return { error: error.message || "Video upload was incomplete" };
  }
  if (already.length + pending.length > 10) {
    return { error: "You can add up to 10 videos" };
  }
  try {
    return claimPostVideos(req.user._id, pending);
  } catch (error) {
    return { error: error.message || "Video upload was incomplete" };
  }
}

exports.addPost = async (req, res) => {
  if (req.isAdmin) {
    return res.status(403).json(ApiResponse({}, "Admins cannot create posts", false));
  }

  const { content, activity, children, classroom, type } = req.body;
  const { image, video } = req.files || {};

  let imagesArr = image ? image.map((item) => item?.filename) : [];
  const uploadedVideos = video ? video.map((item) => item?.filename) : [];
  const streamed = attachStreamedVideos(req, uploadedVideos);
  if (streamed.error) {
    return res.status(400).json(ApiResponse({}, streamed.error, false));
  }
  let videosArr = [...uploadedVideos, ...streamed];

  console.log(req.files);
  try {
    const authorId = req.isAdmin && req.body.author ? req.body.author : req.user._id;
    let newPost = new Post({
      content,
      activity,
      children: children
        ? typeof children === "string"
          ? JSON.parse(children)
          : children
        : [],
      classroom: classroom ? classroom : null,
      type,
      author: authorId,
      images: imagesArr,
      videos: videosArr,
    });

    await newPost.save();
    newPost = await newPost.populate([{ path: 'author', select: '_id firstName lastName image' }, { path: 'activity' }, { path: 'classroom' }])

    return res
      .status(201)
      .json(
        ApiResponse({ newPost }, "Post Added Successfully", true)
      );
  } catch (error) {
    return res.json(
      ApiResponse(
        {},
        errorHandler(error) ? errorHandler(error) : error.message,
        false
      )
    );
  }
};

exports.getAllPosts = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    const userId = req.user._id;

    let finalAggregate = []

    const types = parseQueryList(req.query.type)
      .map((type) => String(type).toUpperCase())
      .filter((type) => type === "CLASS" || type === "CHILD");
    pushInMatch(finalAggregate, "type", types);

    if (req.query.keyword) {
      const keyword = String(req.query.keyword).trim();
      if (keyword) {
        finalAggregate.push({ $match: { content: { $regex: keyword, $options: "i" } } });
      }
    }

    pushInMatch(finalAggregate, "classroom", parseObjectIdList(req.query.classroom));
    pushInMatch(finalAggregate, "activity", parseObjectIdList(req.query.activity));

    const childrenIds = parseObjectIdList(req.query.child || req.query.children);
    if (childrenIds.length) {
      finalAggregate.push({
        $match: { children: { $in: childrenIds } }
      });
    }

    const audience = await postListMatch(req);
    if (audience) finalAggregate.unshift({ $match: audience });


    finalAggregate.push(
      {
        $lookup: {
          from: "teachers",  // Collection name in the database
          localField: "author",
          foreignField: "_id",
          as: "author",
          pipeline: [
            {
              $project: {
                _id: 1,
                firstName: 1,
                lastName: 1,
                image: 1,
              }
            }
          ]
        },
      },
      {
        $unwind: {
          path: "$author",
          preserveNullAndEmptyArrays: true
        },
      },
      {
        $lookup: {
          from: "childrens",
          localField: "children",
          foreignField: "_id",
          as: "children",
        },
      },
      {
        $lookup: {
          from: "classrooms",
          localField: "classroom",
          foreignField: "_id",
          as: "classroom",
        },
      },       {
        $unwind: {
          path: "$classroom",
          preserveNullAndEmptyArrays: true
        },
      },
      {
        $addFields: {
          activityId: "$activity",
        },
      },
      {
        $lookup: {
          from: "activities",
          localField: "activityId",
          foreignField: "_id",
          as: "activity",
        },
      }, {
      $unwind: {
        path: "$activity",
        preserveNullAndEmptyArrays: true,
      },
    }, {
      $sort: {
        createdAt: -1
      }
    }, {
      $addFields: {
        liked: { $in: [userId, "$likes"] },
      },
    });


    finalAggregate.push(
      {
        $lookup: {
          from: "comments",
          localField: "_id",
          foreignField: "post",
          as: "comments",
        },
      },
      {
        $addFields: {
          commentsCount: { $size: "$comments" },
        },
      },
      {
        $project: {
          comments: 0, // Exclude comments array from the final result
        },
      }
    );



    const myAggregate =
      finalAggregate.length > 0
        ? Post.aggregate(finalAggregate)
        : Post.aggregate([]);

    Post.aggregatePaginate(myAggregate, { page, limit }).then((posts) => {
      res.json(ApiResponse(posts));
    });
  } catch (error) {
    console.log(error)
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getAllClassPosts = async (req, res) => {
  try {
    if (!(await canReadClassroom(req, req.params.id))) {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;

    const finalAggregate = [
      { $match: { classroom: new mongoose.Types.ObjectId(req.params.id) } },
    ];

    finalAggregate.push(
      {
        $lookup: {
          from: "teachers",  // Collection name in the database
          localField: "author",
          foreignField: "_id",
          as: "author",
          pipeline: [
            {
              $project: {
                _id: 1,
                firstName: 1,
                lastName: 1,
                image: 1,
              }
            }
          ]
        },
      },
      {
        $unwind: {
          path: "$author",
          preserveNullAndEmptyArrays: true
        },
      },
      {
        $lookup: {
          from: "classrooms",
          localField: "classroom",
          foreignField: "_id",
          as: "classroom",
        },
      },
      {
        $unwind: {
          path: "$classroom",
          preserveNullAndEmptyArrays: true
        },
      },
      {
        $addFields: {
          activityId: "$activity",
        },
      },
      {
        $lookup: {
          from: "activities",
          localField: "activityId",
          foreignField: "_id",
          as: "activity",
        },
      }, {
      $unwind: {
        path: "$activity",
        preserveNullAndEmptyArrays: true,
      },
    },
      {
        $sort: {
          createdAt: -1
        }
      }
    );

    finalAggregate.push(
      {
        $lookup: {
          from: "comments",
          localField: "_id",
          foreignField: "post",
          as: "comments",
        },
      },
      {
        $addFields: {
          commentsCount: { $size: "$comments" },
        },
      },
      {
        $project: {
          comments: 0, // Exclude comments array from the final result
        },
      }
    );

    const myAggregate =
      finalAggregate.length > 0
        ? Post.aggregate(finalAggregate)
        : Post.aggregate([]);

    Post.aggregatePaginate(myAggregate, { page, limit }).then((posts) => {
      res.json(ApiResponse(posts));
    });
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getAllChildPosts = async (req, res) => {
  try {
    if (!(await assertCanAccessChild(req, res, req.params.id))) return;
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    const child = await Children.findById(req.params.id).select("classroom").lean();
    const childId = new mongoose.Types.ObjectId(req.params.id);
    const audience = [{ children: childId }];
    if (child?.classroom) {
      audience.push({ classroom: child.classroom });
    }

    const finalAggregate = [
      {
        $match: {
          status: { $ne: "INACTIVE" },
          $or: audience,
        },
      },
    ];

    finalAggregate.push(
      {
        $lookup: {
          from: "teachers",  // Collection name in the database
          localField: "author",
          foreignField: "_id",
          as: "author",
          pipeline: [
            {
              $project: {
                _id: 1,
                firstName: 1,
                lastName: 1,
                image: 1,
              }
            }
          ]
        },
      },
      {
        $unwind: {
          path: "$author",
          preserveNullAndEmptyArrays: true
        },
      },
      {
        $addFields: {
          activityId: "$activity",
        },
      },
      {
        $lookup: {
          from: "activities",
          localField: "activityId",
          foreignField: "_id",
          as: "activity",
        },
      }, {
      $unwind: {
        path: "$activity",
        preserveNullAndEmptyArrays: true,
      },
    },
      {
        $sort: {
          createdAt: -1
        }
      });

    finalAggregate.push(
      {
        $lookup: {
          from: "comments",
          localField: "_id",
          foreignField: "post",
          as: "comments",
        },
      },
      {
        $addFields: {
          commentsCount: { $size: "$comments" },
        },
      },
      {
        $project: {
          comments: 0, // Exclude comments array from the final result
        },
      }
    );

    const myAggregate =
      finalAggregate.length > 0
        ? Post.aggregate(finalAggregate)
        : Post.aggregate([]);

    Post.aggregatePaginate(myAggregate, { page, limit }).then((posts) => {
      res.json(ApiResponse(posts));
    });
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.likePost = async (req, res) => {
  const postId = req.params.id;
  const userId = req.user._id;
  const { authorType } = req.body;

  try {
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json(ApiResponse({}, "Post not found", false));
    }
    if (!(await assertCanReadPost(req, res, post))) return;

    const likedIndex = post.likes.indexOf(userId);
    const isIndexExists = likedIndex !== -1;

    if (isIndexExists) {
      post.likes.splice(likedIndex, 1); // Remove userId from likes array
    } else {
      post.likes.push(userId); // Add userId to likes array
    }

    await post.save();

    sendLikeAndLoveNotification({
      user: req.user,
      post,
      authorType,
      userId,
      title: isIndexExists ? "Post UnLiked" : "Post Liked",
      msg: authorType === "teacher" ? "Teacher liked a post you are tagged in" : "Parent liked your post"
    });

    res.status(200).json(ApiResponse({}, "Post Liked Successfully", true));
  } catch (error) {
    res.status(500).json(ApiResponse({}, "Internal Server Error", false));
  }
};

exports.commentPost = async (req, res) => {
  const postId = req.params.id;
  const userId = req.user._id;
  const { content, authorType } = req.body;

  try {
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json(ApiResponse({}, "Post not found", false));
    }
    if (!(await assertCanReadPost(req, res, post))) return;

    const newComment = new Comment({
      content,
      author: userId,
      post: post._id
    });

    await newComment.save();

    newComment._doc.author = {
      _id: req.user?._id,
      image: req.user?.image,
      ...(authorType === "teacher" ? { firstName: req.user?.firstName, lastName: req.user?.lastName } : { motherFirstName: req.user?.motherFirstName, motherLastName: req.user?.motherLastName }),
    }

    sendCommentNotification({ post, authorType, comment: newComment });

    res.status(200).json(ApiResponse({ newComment }, "Comment Added Successfully", true));
  } catch (error) {
    console.log(error)
    res.status(500).json(ApiResponse({}, "Internal Server Error", false));
  }
};

exports.getAllPostComments = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;

    const finalAggregate = [
      { $match: { post: new mongoose.Types.ObjectId(req.params.id) } },
      {
        $lookup: {
          from: "teachers",
          localField: "author",
          foreignField: "_id",
          as: "teacherAuthor",
        },
      },

      // Lookup in Parent collection
      {
        $lookup: {
          from: "parents",
          localField: "author",
          foreignField: "_id",
          as: "parentAuthor",
        },
      },

      // Add a new field that combines teacher or parent data
      {
        $addFields: {
          author: {
            $cond: {
              if: { $gt: [{ $size: "$teacherAuthor" }, 0] }, // If teacher exists
              then: {
                _id: { $arrayElemAt: ["$teacherAuthor._id", 0] },
                firstName: { $arrayElemAt: ["$teacherAuthor.firstName", 0] },
                lastName: { $arrayElemAt: ["$teacherAuthor.lastName", 0] },
                image: { $arrayElemAt: ["$teacherAuthor.image", 0] },
              },
              else: {
                _id: { $arrayElemAt: ["$parentAuthor._id", 0] },
                motherFirstName: { $arrayElemAt: ["$parentAuthor.motherFirstName", 0] },
                motherLastName: { $arrayElemAt: ["$parentAuthor.motherLastName", 0] },
                image: { $arrayElemAt: ["$parentAuthor.image", 0] },
              }
            },
          },
        },
      },
      { $project: { teacherAuthor: 0, parentAuthor: 0 } },
    ];

    finalAggregate.push(
      {
        $sort: {
          createdAt: -1
        },
      });

    const myAggregate =
      finalAggregate.length > 0
        ? Comment.aggregate(finalAggregate)
        : Comment.aggregate([]);

    Comment.aggregatePaginate(myAggregate, { page, limit }).then((comments) => {
      res.json(ApiResponse(comments));
    });
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getPostLikes = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).select("likes").lean();
    if (!post) {
      return res.json(ApiResponse({}, "Post not found", false));
    }

    const ids = (post.likes || []).map((id) => String(id));
    if (!ids.length) {
      return res.json(ApiResponse({ docs: [], totalDocs: 0 }, "", true));
    }

    const objectIds = ids
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const Teacher = require("../../Models/Teacher");
    const Parent = require("../../Models/Parent");

    const [teachers, parents] = await Promise.all([
      Teacher.find({ _id: { $in: objectIds } })
        .select("_id firstName lastName image")
        .lean(),
      Parent.find({ _id: { $in: objectIds } })
        .select("_id firstName lastName motherFirstName motherLastName fatherFirstName fatherLastName image")
        .lean(),
    ]);

    const byId = new Map();
    teachers.forEach((item) => {
      byId.set(String(item._id), {
        _id: item._id,
        role: "teacher",
        firstName: item.firstName,
        lastName: item.lastName,
        image: item.image,
      });
    });
    parents.forEach((item) => {
      byId.set(String(item._id), {
        _id: item._id,
        role: "parent",
        firstName: item.motherFirstName || item.fatherFirstName || item.firstName,
        lastName: item.motherLastName || item.fatherLastName || item.lastName,
        motherFirstName: item.motherFirstName,
        motherLastName: item.motherLastName,
        image: item.image,
      });
    });

    const docs = ids
      .map((id) => byId.get(id) || { _id: id, role: "unknown", firstName: "Unknown", lastName: "user" })
      .filter(Boolean);

    return res.json(ApiResponse({ docs, totalDocs: docs.length }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.deleteComment = async (req, res) => {
  try {
    if (!req.isAdmin && req.userRole !== "teacher" && req.userRole !== "parent") {
      return res.status(403).json(ApiResponse({}, "Access denied", false));
    }

    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.json(ApiResponse({}, "Comment not found", false));
    }

    if (!req.isAdmin) {
      if (String(comment.author) !== String(req.user._id)) {
        return res.status(403).json(ApiResponse({}, "You can only delete your own comment", false));
      }
    }

    await comment.deleteOne();
    return res.json(ApiResponse({}, "Comment deleted", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.removePostLike = async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json(ApiResponse({}, "Only admin can remove likes", false));
    }
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.json(ApiResponse({}, "Post not found", false));
    }
    const userId = req.body?.userId || req.params.userId;
    if (!userId) {
      return res.status(400).json(ApiResponse({}, "userId is required", false));
    }
    const before = post.likes.length;
    post.likes = (post.likes || []).filter((id) => String(id) !== String(userId));
    if (post.likes.length === before) {
      return res.json(ApiResponse({}, "Like not found on this post", false));
    }
    await post.save();
    return res.json(ApiResponse({ likesCount: post.likes.length }, "Like removed", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getPostById = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).populate([
      { path: "author", select: "_id firstName lastName image" },
      { path: "activity" },
      { path: "classroom" },
      { path: "children", select: "_id firstName lastName image classroom" },
    ]);

    if (!post) {
      return res.json(ApiResponse({}, "Post not found", false));
    }
    if (!(await assertCanReadPost(req, res, post))) return;

    const commentsCount = await Comment.countDocuments({ post: post._id });
    const payload = post.toObject();
    payload.commentsCount = commentsCount;
    payload.likesCount = Array.isArray(payload.likes) ? payload.likes.length : 0;

    return res.json(ApiResponse({ post: payload }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.updatePost = async (req, res) => {
  try {
    let post = await Post.findById(req.params.id);
    if (!post) return res.json(ApiResponse({}, "Post not found", false));
    if (!assertPostModifyAccess(req, res, post, { adminCanEdit: false })) {
      return;
    }

    let oldImages = req.body.oldImages ? JSON.parse(req.body.oldImages) : [];
    let oldVideos = req.body.oldVideos ? JSON.parse(req.body.oldVideos) : [];

    const newImages = req?.files?.image ? req.files.image.map(file => file.filename) : [];
    const uploadedVideos = req?.files?.video ? req.files.video.map(file => file.filename) : [];
    const streamed = attachStreamedVideos(req, uploadedVideos);
    if (streamed.error) {
      return res.status(400).json(ApiResponse({}, streamed.error, false));
    }
    const newVideos = [...uploadedVideos, ...streamed];

    // Remove old images from server
    oldImages.forEach(item => {
      const filePath = `./Uploads/${item}`;
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });

    // Remove old videos from server
    oldVideos.forEach(item => {
      const filePath = `./Uploads/${item}`;
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });

    // Filter out removed images/videos from existing
    const updatedImages = [...post.images, ...newImages].filter(img => !oldImages.includes(img));
    const updatedVideos = [...post.videos, ...newVideos].filter(vid => !oldVideos.includes(vid));

    // Update post fields
    post.content = req.body.content || post.content || "";
    if (req.body.activity && mongoose.Types.ObjectId.isValid(req.body.activity)) {
      post.activity = req.body.activity;
    }
    post.children = req.body.children ? JSON.parse(req.body.children) : post.children || [];
    post.images = updatedImages;
    post.videos = updatedVideos;

    await post.save();

    // Populate related fields
    post = await Post.findById(post._id)
      .populate([
        { path: 'author', select: '_id firstName lastName image' },
        { path: 'activity' },
        { path: 'classroom' }
      ]);
    
    return res.json(ApiResponse(post, "Post updated successfully"));
  } catch (error) {
    console.error("Update Post Error:", error);
    return res.json(ApiResponse({}, error.message, false));
  }
};

// exports.updatePost = async (req, res) => {
//   try {
//     let post = await Post.findById(req.params.id).populate([{ path: 'author', select: '_id firstName lastName image' }, { path: 'activity' }, { path: 'classroom' }])

//     // console.log(req.body.oldImages);
//     // return


//     let oldImages = req.body.oldImages ? JSON.parse(req.body.oldImages) : [];
//     let oldVideos = req.body.oldVideos ? JSON.parse(req.body.oldVideos) : [];
//     let allImages = []
//     let allVideos = []


//     post.content = req.body.content ? req.body.content : (post.content || "");
//     post.activity = req.body.activity ? req.body.activity : (post.activity || "");
//     post.children = req.body.children ? JSON.parse(req.body.children) : (post.children || [])

//     let temp = req?.files?.image ? req?.files?.image.map(item => item.filename) : []
//     allImages = [...post.images, ...temp];

//     let temp2 = req?.files?.video ? req?.files?.video.map(item => item.filename) : []
//     allVideos = [...post.videos, ...temp2];




//     if (oldImages && oldImages.length > 0) {

//       oldImages.map(item => {
//         const filePath = `./Uploads/${item}`;
//         if (fs.existsSync(filePath)) {
//           fs.unlinkSync(filePath);
//         }
//       });
//     }

//     post.images = allImages.filter(image => !oldImages.includes(image)) || []

//     if (oldVideos && oldVideos.length > 0) {

//       oldVideos.map(item => {
//         const filePath = `./Uploads/${item}`;
//         if (fs.existsSync(filePath)) {
//           fs.unlinkSync(filePath);
//         }
//       });
//     }

//     post.videos = allVideos.filter(video => !oldVideos.includes(video)) || []


//     await post.save();
//     return res.json(ApiResponse(post, "Post updated successfully"));
//   } catch (error) {
//     // Handle errors
//     console.error(error);
//     return res.json(ApiResponse({}, error.message, false));
//   }
// };

exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.json(ApiResponse({}, "Post not found", false));
    }
    if (!assertPostModifyAccess(req, res, post, { adminCanEdit: true })) {
      return;
    }

    await Post.findByIdAndRemove(req.params.id);

    return res.json(ApiResponse({}, "Post Deleted Successfully", true));
  } catch (error) {
    return res.json(ApiResponse({}, errorHandler(error) ? errorHandler(error) : error.message, false));
  }
};
