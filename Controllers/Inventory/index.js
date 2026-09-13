//Models
const Classroom = require("../../Models/Classroom");
const Inventory = require("../../Models/Inventory");
const fs = require("fs");
const crypto = require("crypto");
const moment = require("moment");
//Helpers
const { generateToken } = require("../../Helpers/index");
const { ApiResponse } = require("../../Helpers/index");
const { validateToken } = require("../../Helpers/index");
const { generateString } = require("../../Helpers/index");
const { errorHandler } = require("../../Helpers/errorHandler");
const {generateRandom6DigitID} = require("../../Helpers")
const { parseQueryList, parseObjectIdList, pushInMatch } = require("../../Helpers/queryList");

const {
  sendNotificationToAdmin,
  sendNotificationToUser,
} = require("../../Helpers/notification");
const sanitizeUser = require("../../Helpers/sanitizeUser");
const {
  createResetToken,
  validateResetToken,
} = require("../../Helpers/verification");
const mongoose = require("mongoose");

function totalIssued(inventory) {
  return (inventory?.issuances || []).reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
}

function availableStock(inventory) {
  return Math.max(0, (Number(inventory?.quantity) || 0) - totalIssued(inventory));
}

//addInventory
exports.addInventory = async (req, res) => {
  const {
    title,
    description,
    quantity,
    manufacturer,
    purchaseDate,
    unitPrice,
    lastAuditDate,
    notes,
    category,
    storageLocation,
  } = req.body;

  let sku = await generateRandom6DigitID("I");

  try {
    const inventory = new Inventory({
      sku,
      title,
      description,
      quantity,
      manufacturer,
      purchaseDate,
      unitPrice,
      lastAuditDate,
      notes,
      category,
      storageLocation: storageLocation || "",
      issuances: [],
      gallery: req.files.gallery
        ? req.files.gallery.map((item) => item.filename)
        : "",
    });

    await inventory.save();

    return res.status(200).json(
      ApiResponse({ inventory }, "Inventory Created Successfully", true)
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

exports.getAllInventorys = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;

    let finalAggregate = [
      {
        $sort: {
          title: 1,
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "category",
        },
      },
      {
        $unwind: "$category",
      },
    ];

    if (req.query) {
      if (req.query.keyword) {
        const regex = new RegExp(req.query.keyword.toLowerCase(), "i");
        finalAggregate.push({
          $match: {
            $or: [
              { title: { $regex: regex } },
              { description: { $regex: regex } },
            ],
          },
        });
      }


      if (req.query.category) {
        pushInMatch(finalAggregate, "category._id", parseObjectIdList(req.query.category));
      }
      if (req.query.status) {
        pushInMatch(finalAggregate, "status", parseQueryList(req.query.status));
      }
    }



    const myAggregate =
      finalAggregate.length > 0
        ? Inventory.aggregate(finalAggregate)
        : Inventory.aggregate([]);

    Inventory.aggregatePaginate(myAggregate, { page, limit }).then(
      (inventorys) => {
        res.json(ApiResponse(inventorys));
      }
    );
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

// Get inventory by ID
exports.getInventoryById = async (req, res) => {
  try {
    const inventory = await Inventory.findById(req.params.id);

    if (!inventory) {
      return res.json(ApiResponse({}, "Inventory not found", true));
    }

    return res.json(ApiResponse({ inventory }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

// Get inventory by Category
exports.getInventoryByCategory = async (req, res) => {
  try {
    const inventorys = await Inventory.findOne({ category: req.params.id });

    if (!inventorys) {
      return res.json(ApiResponse({}, "Inventory not found", true));
    }

    return res.json(ApiResponse({ inventorys }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.updateInventory = async (req, res) => {
  try {
    let inventory = await Inventory.findById(req.params.id);
    let oldImages = req.body.oldImages ? JSON.parse(req.body.oldImages) : [];
    let allImages = [];


    if (!inventory) {
      return res.json(ApiResponse({}, "Inventory not found", true));
    }


    inventory.title = req.body.title ? req.body.title : inventory.title || "";
    inventory.description = req.body.description
      ? req.body.description
      : inventory.description || "";
    inventory.unitPrice = req.body.unitPrice
      ? req.body.unitPrice
      : inventory.unitPrice || 0;
    inventory.quantity = req.body.quantity
      ? req.body.quantity
      : inventory.quantity || 0;
    inventory.manufacturer = req.body.manufacturer
      ? req.body.manufacturer
      : inventory.manufacturer || "";
    inventory.purchaseDate = req.body.purchaseDate
      ? req.body.purchaseDate
      : inventory.purchaseDate;
    inventory.lastAuditDate = req.body.lastAuditDate
      ? req.body.lastAuditDate
      : inventory.lastAuditDate;
    inventory.notes = req.body.notes ? req.body.notes : inventory.notes;
    inventory.category = req.body.category
      ? req.body.category
      : inventory.category || "";
    inventory.storageLocation = req.body.storageLocation
      ? req.body.storageLocation
      : inventory.storageLocation || "";

    const nextQuantity = Number(inventory.quantity) || 0;
    if (nextQuantity < totalIssued(inventory)) {
      return res.json(
        ApiResponse(
          {},
          "Total stock cannot be less than already issued quantity",
          false
        )
      );
    }



    let temp = req?.files?.gallery ? req.files.gallery.map((item) => item.filename) : [];
    let galleryOrder = [];
    if (req.body.galleryOrder) {
      try {
        galleryOrder = JSON.parse(req.body.galleryOrder);
      } catch (_) {
        galleryOrder = [];
      }
    }
    const leadingNewCount = Math.max(0, parseInt(req.body.leadingNewCount || "0", 10) || 0);

    if (Array.isArray(galleryOrder) && galleryOrder.length) {
      const keptExisting = galleryOrder.filter(
        (name) => inventory.gallery.includes(name) && !oldImages.includes(name)
      );
      const leadingNew = temp.slice(0, leadingNewCount);
      const trailingNew = temp.slice(leadingNewCount);
      allImages = [...leadingNew, ...keptExisting, ...trailingNew];
    } else {
      allImages = [...inventory.gallery, ...temp];
    }

    if (oldImages && oldImages.length > 0) {
      oldImages.map((item) => {
        const filePath = `./Uploads/${item}`;
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    }

    inventory.gallery =
      allImages.filter((image) => !oldImages.includes(image)) || [];

    await inventory.save();
    return res.json(ApiResponse(inventory, "Inventory updated successfully"));
  } catch (error) {
    // Handle errors
    console.error(error);
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.issueStock = async (req, res) => {
  try {
    const inventory = await Inventory.findById(req.params.id);
    if (!inventory) {
      return res.json(ApiResponse({}, "Inventory not found", false));
    }

    const quantity = Math.max(0, parseInt(req.body.quantity || "0", 10) || 0);
    const assignedToType = req.body.assignedToType;
    const validTypes = ["TEACHER", "CLASSROOM", "STAFF", "DEPARTMENT"];

    if (!quantity) {
      return res.json(ApiResponse({}, "Issue quantity is required", false));
    }
    if (!validTypes.includes(assignedToType)) {
      return res.json(ApiResponse({}, "Please select who to issue to", false));
    }
    if (quantity > availableStock(inventory)) {
      return res.json(
        ApiResponse({}, "Not enough stock available to issue", false)
      );
    }

    if (
      (assignedToType === "TEACHER" || assignedToType === "CLASSROOM") &&
      !req.body.assignedToId
    ) {
      return res.json(ApiResponse({}, "Please select an assignee", false));
    }

    if (
      (assignedToType === "STAFF" || assignedToType === "DEPARTMENT") &&
      !req.body.assignedToName
    ) {
      return res.json(ApiResponse({}, "Please enter assignee name", false));
    }

    inventory.issuances.push({
      quantity,
      assignedToType,
      assignedToId:
        assignedToType === "TEACHER" || assignedToType === "CLASSROOM"
          ? req.body.assignedToId
          : undefined,
      assignedToName: req.body.assignedToName || "",
      issuedDate: req.body.issuedDate || new Date(),
      notes: req.body.notes || "",
    });

    await inventory.save();
    return res.json(ApiResponse({ inventory }, "Stock issued successfully", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.removeIssuance = async (req, res) => {
  try {
    const inventory = await Inventory.findById(req.params.id);
    if (!inventory) {
      return res.json(ApiResponse({}, "Inventory not found", false));
    }

    const issuanceId = req.params.issuanceId;
    const before = inventory.issuances.length;
    inventory.issuances = inventory.issuances.filter(
      (row) => String(row._id) !== String(issuanceId)
    );

    if (inventory.issuances.length === before) {
      return res.json(ApiResponse({}, "Issuance record not found", false));
    }

    await inventory.save();
    return res.json(ApiResponse({ inventory }, "Issuance returned to stock", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

//toggleStatus
exports.toggleStatus = async (req, res) => {
  try {
    
    let inventory = await Inventory.findById(req.params.id);

    if (!inventory) {
      return res.json(ApiResponse({}, "Inventory not found", false));
    }

      inventory.status = inventory.status == "ACTIVE" ? "INACTIVE" : "ACTIVE"
      await inventory.save();     

      return res.json(ApiResponse(inventory, "Inventory Status Changed"));
  
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};



// Delete a inventory
exports.deleteInventory = async (req, res) => {
  try {
    const inventory = await Inventory.findByIdAndRemove(req.params.id);

    if (!inventory) {
      return res.json(ApiResponse({}, "Inventory not found", false));
    }

    return res.json(ApiResponse({}, "Inventory Deleted Successfully", true));
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
