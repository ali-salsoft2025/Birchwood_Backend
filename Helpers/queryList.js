const mongoose = require("mongoose");

function parseQueryList(value) {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => parseQueryList(item));
  }
  const str = String(value).trim();
  if (!str) return [];
  if (str.startsWith("[")) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) return parseQueryList(parsed);
    } catch {
      // fall through to comma split
    }
  }
  return str.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseObjectIdList(value) {
  return parseQueryList(value)
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

function inMatch(field, values) {
  if (!values?.length) return null;
  return values.length === 1 ? { [field]: values[0] } : { [field]: { $in: values } };
}

function pushInMatch(pipeline, field, values) {
  const match = inMatch(field, values);
  if (match) pipeline.push({ $match: match });
}

module.exports = {
  parseQueryList,
  parseObjectIdList,
  inMatch,
  pushInMatch,
};
