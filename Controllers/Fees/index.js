//Models
const Fees = require("../../Models/Fees");
const moment = require("moment");

//Helpers
const { generateToken } = require("../../Helpers/index");
const { ApiResponse } = require("../../Helpers/index");
const { errorHandler } = require("../../Helpers/errorHandler");
const { sendNotificationToAdmin } = require("../../Helpers/notification");
const { generateFeeReceiptNo } = require("../../Helpers/feeReceipt");
const { assertCanAccessChild } = require("../../Helpers/accessControl");
const { default: mongoose } = require("mongoose");
const { parseQueryList, parseObjectIdList, pushInMatch } = require("../../Helpers/queryList");


exports.createVoucher = async (req, res) => {
  try {
    const { children, amount, month, year, dueDate, paymentDate } = req.body;
    const receiptNo = await generateFeeReceiptNo(month, year);

    const fee = new Fees({
      receiptNo,
      children,
      amount,
      month,
      year,
      dueDate,
      paymentDate,
    });

    await fee.save();

    const title2 = "New Voucher Created";
    const content2 = `A new fee voucher been created`;
    sendNotificationToAdmin(title2, content2);

    return res
      .status(200)
      .json(ApiResponse({ fee }, "Fee Voucher Created Successfully", true));
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

exports.getAllVouchers = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    let { keyword,children, from, to, status } = req.query;

    let finalAggregate = [
      {
        $sort: {
          dueDate: 1,
        },
      },
    ];

    if (children) {
      pushInMatch(finalAggregate, "children", parseObjectIdList(children));
    }

    const statuses = parseQueryList(status).map((item) => String(item).toUpperCase());
    const paidFlags = [...new Set(statuses.map((item) => item === "PAID"))];
    if (paidFlags.length === 1) {
      finalAggregate.push({
        $match: { isPaid: paidFlags[0] },
      });
    }

    if (from) {
      finalAggregate.push({
        $match: {
          dueDate: {
            $gte: moment(from).startOf("day").toDate(),
          },
        },
      });
    }

    if (to) {
      finalAggregate.push({
        $match: {
          dueDate: {
            $lte: moment(to).endOf("day").toDate(),
          },
        },
      });
    }

    finalAggregate.push(
      {
        $lookup: {
          from: "childrens",
          localField: "children",
          foreignField: "_id",
          as: "child",
        },
      },
      {
        $unwind: {
          path: "$child",
          preserveNullAndEmptyArrays: true,
        },
      }
    );

    const myAggregate =
      finalAggregate.length > 0
        ? Fees.aggregate(finalAggregate)
        : Fees.aggregate([]);

    Fees.aggregatePaginate(myAggregate, { page, limit }).then(
      (fees) => {
        res.json(ApiResponse(fees));
      }
    );
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.getAllChildVouchers = async (req, res) => {
  try {
    if (!(await assertCanAccessChild(req, res, req.params.id))) {
      return;
    }

    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    let { keyword, from, to, status } = req.query;

    let finalAggregate = [{
      $match:{
        children:new mongoose.Types.ObjectId(req.params.id)
      }
    },
      {
        $sort: {
          dueDate: 1,
        },
      },
    ];


    if (from) {
      finalAggregate.push({
        $match: {
          dueDate: {
            $gte: moment(from).startOf("day").toDate(),
          },
        },
      });
    }

    if (to) {
      finalAggregate.push({
        $match: {
          dueDate: {
            $lte: moment(to).endOf("day").toDate(),
          },
        },
      });
    }

    const myAggregate =
      finalAggregate.length > 0
        ? Fees.aggregate(finalAggregate)
        : Fees.aggregate([]);

    Fees.aggregatePaginate(myAggregate, { page, limit }).then(
      (fees) => {
        res.json(ApiResponse(fees));
      }
    );
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

// Get fee by ID
exports.getVoucherById = async (req, res) => {
  try {
    const fee = await Fees.findById(req.params.id)

    if (!fee) {
      return res.json(ApiResponse({}, "Voucher not found", true));
    }

    return res.json(ApiResponse({ fee }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

// Get fee by ID
exports.updateVoucher = async (req, res) => {
  try {
    let fee = await Fees.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });

    if (!fee) {
      return res.json(ApiResponse({}, "No Voucher found", false));
    }

    return res.json(ApiResponse(fee, "Voucher updated successfully"));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

//toggleStatus
exports.toggleStatus = async (req, res) => {
  try {
    
    let fee = await Fees.findById(req.params.id);
    
    if (!fee) {
      return res.json(ApiResponse({}, "Voucher not found", false));
    }

      fee.isPaid = !fee.isPaid;
      await fee.save();     

      return res.json(ApiResponse(fee, "Voucher Status Changed"));
  
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};


// Delete a fee
exports.deleteVoucher = async (req, res) => {
  try {
    const fee = await Fees.findByIdAndRemove(req.params.id);

    if (!fee) {
      return res.json(ApiResponse({}, "Voucher not found", false));
    }

    return res.json(ApiResponse({}, "Voucher Deleted Successfully", true));
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
