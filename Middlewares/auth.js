const jwt = require("jsonwebtoken");
const Parent = require("../Models/Parent");
const Teacher = require("../Models/Teacher");
const Admin = require("../Models/Admin");
const { ApiResponse, verifyAdminToken, ADMIN_TOKEN_TYPE } = require("../Helpers");
require("../config/loadEnv");

const getToken = (req) =>
  req.headers.authorization || req.body.token || req.query.token;

const verifyUserToken = (token) =>
  jwt.verify(String(token).replace("Bearer ", ""), process.env.JWT_SECRET);

exports.authenticatedRoute = async (req, res, next) => {
  const token = getToken(req);

  if (!token) {
    return res.status(403).json(ApiResponse({}, "Access Forbidden", false));
  }

  try {
    try {
      const adminDecoded = verifyAdminToken(token);
      if (adminDecoded.tokenType === ADMIN_TOKEN_TYPE && adminDecoded.role === "admin") {
        const admin = await Admin.findById(adminDecoded._id);
        if (admin && admin.status === "ACTIVE") {
          req.user = admin;
          req.admin = admin;
          req.isAdmin = true;
          req.userRole = "admin";
          return next();
        }
      }
    } catch (adminErr) {
      // Not a valid admin token; try parent/teacher token next.
    }

    const decoded = verifyUserToken(token);

    if (decoded.tokenType === ADMIN_TOKEN_TYPE || decoded.role === "admin") {
      return res.status(401).json(ApiResponse({}, "Unauthorized Access", false));
    }

    const parent = await Parent.findById(decoded._id);
    const teacher = await Teacher.findById(decoded._id);

    if (!parent && !teacher) {
      return res.status(401).json(ApiResponse({}, "Unauthorized Access", false));
    }

    req.user = parent || teacher;
    req.isAdmin = false;
    req.userRole = parent ? "parent" : "teacher";
    next();
  } catch (err) {
    return res
      .status(401)
      .json(ApiResponse({}, "Session expired, Please sign in again", false));
  }
};

exports.staffRoute = async (req, res, next) => {
  const token = getToken(req);

  if (!token) {
    return res.status(403).json(ApiResponse({}, "Access Forbidden", false));
  }

  try {
    const adminDecoded = verifyAdminToken(token);
    if (adminDecoded.tokenType === ADMIN_TOKEN_TYPE && adminDecoded.role === "admin") {
      const admin = await Admin.findById(adminDecoded._id);
      if (admin && admin.status === "ACTIVE") {
        req.user = admin;
        req.admin = admin;
        req.isAdmin = true;
        req.userRole = "admin";
        return next();
      }
    }
  } catch (adminErr) {
    // Not an admin token.
  }

  try {
    const decoded = verifyUserToken(token);
    const teacher = await Teacher.findById(decoded._id);
    if (!teacher) {
      return res.status(401).json(ApiResponse({}, "Unauthorized Access", false));
    }
    req.user = teacher;
    req.isAdmin = false;
    req.userRole = "teacher";
    return next();
  } catch (err) {
    return res.status(401).json(ApiResponse({}, "Session expired, Please sign in again", false));
  }
};

exports.adminRoute = async (req, res, next) => {
  const token = getToken(req);

  if (!token) {
    return res.status(403).json(ApiResponse({}, "Access Forbidden", false));
  }

  try {
    const decoded = verifyAdminToken(token);

    if (decoded.tokenType !== ADMIN_TOKEN_TYPE || decoded.role !== "admin") {
      return res.status(401).json(ApiResponse({}, "Unauthorized Access", false));
    }

    const admin = await Admin.findById(decoded._id);

    if (!admin || admin.status !== "ACTIVE") {
      return res.status(401).json(ApiResponse({}, "Unauthorized Access", false));
    }

    req.user = admin;
    req.admin = admin;
    req.isAdmin = true;
    req.userRole = "admin";
    next();
  } catch (err) {
    return res
      .status(401)
      .json(ApiResponse({}, "Invalid admin token, Please sign in again", false));
  }
};
