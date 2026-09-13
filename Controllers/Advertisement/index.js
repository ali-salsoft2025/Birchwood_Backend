const fs = require("fs");
const Advertisement = require("../../Models/Advertisement");
const { ApiResponse } = require("../../Helpers/index");
const { errorHandler } = require("../../Helpers/errorHandler");
const { parseQueryList, pushInMatch } = require("../../Helpers/queryList");

function unlinkImage(filename) {
  if (!filename) return;
  const filePath = `./Uploads/${filename}`;
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

exports.addAdvertisement = async (req, res) => {
  try {
    if (!req.body.image) {
      return res
        .status(400)
        .json(ApiResponse({}, "Image is required", false));
    }

    const advertisement = new Advertisement({
      title: req.body.title || "",
      image: req.body.image,
      link: req.body.link || "",
      order: Number(req.body.order) || 0,
      status: req.body.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    });

    await advertisement.save();

    return res
      .status(200)
      .json(
        ApiResponse({ advertisement }, "Advertisement added successfully", true)
      );
  } catch (error) {
    return res.status(500).json(ApiResponse({}, error.message, false));
  }
};

exports.getAllAdvertisements = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const { keyword, status } = req.query;

    const finalAggregate = [];

    if (keyword) {
      const regex = new RegExp(String(keyword).toLowerCase(), "i");
      finalAggregate.push({
        $match: {
          $or: [{ title: { $regex: regex } }, { link: { $regex: regex } }],
        },
      });
    }

    if (status) {
      pushInMatch(finalAggregate, "status", parseQueryList(status));
    }

    finalAggregate.push({
      $sort: {
        order: 1,
        createdAt: -1,
      },
    });

    const myAggregate = Advertisement.aggregate(finalAggregate);
    const result = await Advertisement.aggregatePaginate(myAggregate, {
      page,
      limit,
    });

    return res.json(ApiResponse(result));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getActiveAdvertisements = async (req, res) => {
  try {
    const advertisements = await Advertisement.find({ status: "ACTIVE" })
      .sort({ order: 1, createdAt: -1 })
      .lean();

    return res.json(
      ApiResponse({ advertisements }, "", true)
    );
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getAdvertisementById = async (req, res) => {
  try {
    const advertisement = await Advertisement.findById(req.params.id);
    if (!advertisement) {
      return res.json(ApiResponse({}, "Advertisement not found", false));
    }
    return res.json(ApiResponse({ advertisement }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.updateAdvertisement = async (req, res) => {
  try {
    const current = await Advertisement.findById(req.params.id);
    if (!current) {
      return res.json(ApiResponse({}, "Advertisement not found", false));
    }

    if (req.body.image) {
      unlinkImage(current.image);
    }

    const payload = {
      title: req.body.title !== undefined ? req.body.title : current.title,
      link: req.body.link !== undefined ? req.body.link : current.link,
      order:
        req.body.order !== undefined
          ? Number(req.body.order) || 0
          : current.order,
      status:
        req.body.status !== undefined
          ? req.body.status === "INACTIVE"
            ? "INACTIVE"
            : "ACTIVE"
          : current.status,
    };

    if (req.body.image) {
      payload.image = req.body.image;
    }

    const advertisement = await Advertisement.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true }
    );

    return res.json(
      ApiResponse({ advertisement }, "Advertisement updated successfully", true)
    );
  } catch (error) {
    return res.json(
      ApiResponse({}, errorHandler(error) ? errorHandler(error) : error.message, false)
    );
  }
};

exports.deleteAdvertisement = async (req, res) => {
  try {
    const advertisement = await Advertisement.findByIdAndDelete(req.params.id);
    if (!advertisement) {
      return res.json(ApiResponse({}, "Advertisement not found", false));
    }
    unlinkImage(advertisement.image);
    return res.json(ApiResponse({}, "Advertisement deleted successfully", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};
