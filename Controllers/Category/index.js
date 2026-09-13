//Models
const Category = require("../../Models/Category");
const moment = require("moment");

//Helpers
const { generateToken } = require("../../Helpers/index");
const { ApiResponse } = require("../../Helpers/index");
const { errorHandler } = require("../../Helpers/errorHandler");
const { sendNotificationToAdmin } = require("../../Helpers/notification");
const { parseQueryList, pushInMatch } = require("../../Helpers/queryList");

exports.addCategory = async (req, res) => {
  const { title, description } = req.body;
  try {
    const existingCategory = await Category.findOne({ title });
    if (existingCategory) {
      return res.json(ApiResponse({}, "Category already Exists", false));
    }

    const category = new Category({
      title,
      description,
    });

    await category.save();

    const title2 = "New Category Created";
    const content2 = `A new category has been created.category Name : ${title}`;
    sendNotificationToAdmin(title2, content2);

    return res
      .status(200)
      .json(ApiResponse({ category }, "Category Created Successfully", true));
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

exports.getAllcategories = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    let { keyword, from, to, status } = req.query;

    let finalAggregate = [
      {
        $sort: {
          title: 1,
        },
      },
    ];

    if (keyword) {
      const regex = new RegExp(keyword.toLowerCase(), "i");
      finalAggregate.push({
        $match: {
          $or: [
            { title: { $regex: regex } },
            { description: { $regex: regex } },
          ],
        },
      });
    }

    if (status) {
      pushInMatch(finalAggregate, "status", parseQueryList(status));
    }

    if (from) {
      finalAggregate.push({
        $match: {
          createdAt: {
            $gte: moment(from).startOf("day").toDate(),
          },
        },
      });
    }

    if (to) {
      finalAggregate.push({
        $match: {
          createdAt: {
            $lte: moment(to).endOf("day").toDate(),
          },
        },
      });
    }

    const myAggregate =
      finalAggregate.length > 0
        ? Category.aggregate(finalAggregate)
        : Category.aggregate([]);

    Category.aggregatePaginate(myAggregate, { page, limit }).then(
      (categories) => {
        res.json(ApiResponse(categories));
      }
    );
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

// Get category by ID
exports.getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id)

    if (!category) {
      return res.json(ApiResponse({}, "Category not found", true));
    }

    return res.json(ApiResponse({ category }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

// Get category by ID
exports.updateCategory = async (req, res) => {
  try {
    let category = await Category.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });

    if (!category) {
      return res.json(ApiResponse({}, "No category found", false));
    }

    return res.json(ApiResponse(category, "Category updated successfully"));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

//toggleStatus
exports.toggleStatus = async (req, res) => {
  try {
    
    let category = await Category.findById(req.params.id);
    
    if (!category) {
      return res.json(ApiResponse({}, "Category not found", false));
    }

      category.status = category.status == "ACTIVE" ? "INACTIVE" : "ACTIVE"
      await category.save();     

      return res.json(ApiResponse(category, "Category Status Changed"));
  
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};


// Delete a category
exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndRemove(req.params.id);

    if (!category) {
      return res.json(ApiResponse({}, "Category not found", false));
    }

    return res.json(ApiResponse({}, "Category Deleted Successfully", true));
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
