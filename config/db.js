const mongoose = require("mongoose");

const DB_URI = process.env.DB;

if (!DB_URI) {
  throw new Error("DB connection string is required (process.env.DB)");
}

mongoose.set("strictQuery", true);

const connectOptions = {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  // Keep trying after a transient outage (default buffer timeout is 10s)
  bufferCommands: true,
};

let connecting = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  if (connecting) {
    return connecting;
  }

  connecting = mongoose
    .connect(DB_URI, connectOptions)
    .then((conn) => {
      console.log("Database Connected");
      return conn;
    })
    .catch((err) => {
      console.error("Error in Database Connection", err.message || err);
      throw err;
    })
    .finally(() => {
      connecting = null;
    });

  return connecting;
}

mongoose.connection.on("disconnected", () => {
  console.warn("Database disconnected — will reconnect on next request");
});

mongoose.connection.on("reconnected", () => {
  console.log("Database reconnected");
});

mongoose.connection.on("error", (err) => {
  console.error("Database connection error:", err.message || err);
});

// Initial connect (non-blocking for require; errors logged)
connectDB().catch(() => {
  // Retry a few times in the background so a cold Mongo start doesn't kill the API
  let attempt = 0;
  const maxAttempts = 5;
  const timer = setInterval(() => {
    attempt += 1;
    if (mongoose.connection.readyState === 1 || attempt > maxAttempts) {
      clearInterval(timer);
      return;
    }
    console.log(`Retrying database connection (${attempt}/${maxAttempts})…`);
    connectDB().catch(() => {});
  }, 5000);
});

module.exports = mongoose;
module.exports.connectDB = connectDB;
