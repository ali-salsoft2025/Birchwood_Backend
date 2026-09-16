const express = require("express");
const http = require("http");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const { envFile } = require("./config/loadEnv");

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is required");
}
if (!process.env.JWT_ADMIN_SECRET) {
  throw new Error("JWT_ADMIN_SECRET is required");
}

const app = express();
const PORT = Number(process.env.PORT) || 3031;
const mongoose = require("./config/db");

function getServiceInfo() {
  const dbStates = ["disconnected", "connected", "connecting", "disconnecting"];
  const environment = process.env.NODE_ENV || "development";
  const version = process.env.VERSION || "1.0.0";
  const dbStatus = dbStates[mongoose.connection.readyState] || "unknown";

  return {
    name: "Birchwood Academy API",
    status: "running",
    message: `Birchwood Academy API v${version} is running.`,
    environment,
    version,
    port: PORT,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    node: process.version,
    database: {
      status: dbStatus,
      connected: mongoose.connection.readyState === 1,
    },
    envFile,
    endpoints: {
      root: "/",
      health: "/api/health",
      api: "/api",
    },
  };
}

const { getCorsOptions } = require("./config/cors");
const corsOptions = getCorsOptions();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

morgan.token("remote-addr", (req) => {
  const addr = req.ip || (req.socket && req.socket.remoteAddress) || "";
  return addr.replace(/^::ffff:/i, "");
});
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => {
  res.status(200).json(getServiceInfo());
});

const limiter = rateLimit({
  max: 2000,
  windowMs: 15 * 60 * 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests from this IP, please try again later",
});

app.use("/api", limiter);
app.use(
  "/Uploads",
  express.static("./Uploads", {
    acceptRanges: true,
    fallthrough: true,
    setHeaders(res, filePath) {
      if (/\.(mp4|mov|m4v|webm|avi)$/i.test(filePath)) {
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      }
    },
  })
);
app.use(
  "/uploads",
  express.static("./Uploads", {
    acceptRanges: true,
    fallthrough: true,
    setHeaders(res, filePath) {
      if (/\.(mp4|mov|m4v|webm|avi)$/i.test(filePath)) {
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      }
    },
  })
);
app.use("/api", require("./Routes/index"));

app.get("/", (req, res) => {
  res.status(200).json(getServiceInfo());
});

const { initSocket } = require("./config/socket");

const server = http.createServer(app);
initSocket(server);

server.listen(PORT, () => {
  const env = process.env.NODE_ENV || "development";
  console.log(`Birchwood Server is running on port ${PORT} (${env}, ${envFile})`);
  console.log("Socket.IO notifications enabled");
});
