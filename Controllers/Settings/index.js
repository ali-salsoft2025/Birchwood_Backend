const SchoolSettings = require("../../Models/SchoolSettings");
const { ApiResponse } = require("../../Helpers/index");

const TOGGLEABLE = ["fees", "gallery", "ads"];

exports.getModules = async (req, res) => {
  try {
    const modules = await SchoolSettings.getModules();
    return res.json(ApiResponse({ modules }, "", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};

exports.updateModules = async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json(ApiResponse({}, "Only admin can update modules", false));
    }
    const doc = await SchoolSettings.getSingleton();
    const incoming = req.body?.modules || req.body || {};
    TOGGLEABLE.forEach((key) => {
      if (typeof incoming[key] === "boolean") {
        doc.modules[key] = incoming[key];
      }
    });
    await doc.save();
    const modules = await SchoolSettings.getModules();
    return res.json(ApiResponse({ modules }, "Module settings saved", true));
  } catch (error) {
    return res.json(ApiResponse({}, error.message, false));
  }
};
