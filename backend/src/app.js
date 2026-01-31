import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";

import { connectDb } from "./db.js";

// ---- routes ----
import authRoutes from "./routes/auth.routes.js";
import farmRoutes from "./routes/farm.routes.js";
import sensorRoutes from "./routes/sensor.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import deviceRoutes from "./routes/device.routes.js";
import plantRoutes from "./routes/plant.routes.js";
import discordRoutes from "./routes/discord.routes.js";
import deviceStatusRoutes from "./routes/deviceStatus.routes.js";
import alertRulesRoutes from "./routes/alertRules.routes.js";
import alertSettingRoutes from "./routes/alertSetting.routes.js";
import waterUsageRoutes from "./routes/waterUsage.routes.js";
import cronRoutes from "./routes/cron.routes.js";

dotenv.config();

const app = express();

app.set("trust proxy", 1);

const frontendFromEnv = process.env.FRONTEND_URL;
const extraOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const allowedOriginSuffixes = [
  ".ngrok-free.dev",
];

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://hospital-minor-living-goes.trycloudflare.com",
  frontendFromEnv,
  ...extraOrigins,
].filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    try {
      const { hostname } = new URL(origin);
      if (allowedOriginSuffixes.some((suffix) => hostname.endsWith(suffix))) {
        return cb(null, true);
      }
    } catch {
      // Ignore invalid origin format.
    }
    return cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-farm-id",
    "device_key",
    "ngrok-skip-browser-warning",
  ],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

// Ensure DB connection (serverless safe)
app.use(async (_req, _res, next) => {
  try {
    const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
    await connectDb(MONGO_URI);
    next();
  } catch (err) {
    next(err);
  }
});

app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl} from ${req.ip}`);
  next();
});

app.get("/", (req, res) => {
  res.json({
    ok: true,
    name: "SmartFarm API",
    time: new Date().toISOString(),
    ip: req.ip,
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    ip: req.ip,
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/farms", farmRoutes);
app.use("/api/plants", plantRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/sensor", sensorRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/device", deviceRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/discord", discordRoutes);
app.use("/api/device-status", deviceStatusRoutes);
app.use("/api/alert-rules", alertRulesRoutes);
app.use("/api/alert-setting", alertSettingRoutes);
app.use("/api/water-usage", waterUsageRoutes);
app.use("/api/cron", cronRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    method: req.method,
    path: req.originalUrl,
  });
});

app.use((err, _req, res, _next) => {
  console.error("SERVER ERROR:", err?.message || err);
  res.status(500).json({ error: err?.message || "Server error" });
});

export default app;
