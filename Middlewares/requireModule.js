const SchoolSettings = require("../Models/SchoolSettings");
const { ApiResponse } = require("../Helpers/index");

function requireModule(key) {
  return async (req, res, next) => {
    try {
      const modules = await SchoolSettings.getModules();
      if (modules[key] === false) {
        return res.status(403).json(ApiResponse({}, "This feature is turned off", false));
      }
      return next();
    } catch (error) {
      return res.status(500).json(ApiResponse({}, error.message, false));
    }
  };
}

module.exports = { requireModule };
