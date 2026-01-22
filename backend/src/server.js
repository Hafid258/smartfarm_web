// backend/src/server.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import mongoose from "mongoose";

// ---- routes (ของเดิมโปรเจกต์คุณ) ----
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

// ---- NEW routes (ถ้าคุณเพิ่ม water usage) ----
import waterUsageRoutes from "./routes/waterUsage.routes.js";

// ---- models for scheduler ----
import FarmSetting from "./models/FarmSetting.js";
import DeviceCommand from "./models/DeviceCommand.js";

dotenv.config();

const app = express();

// ✅ ช่วยกรณีอยู่หลัง proxy/บาง network
app.set("trust proxy", 1);

/**
 * ✅ CORS (รองรับ dev/prod + allow headers)
 */
const frontendFromEnv = process.env.FRONTEND_URL;
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  frontendFromEnv,
].filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    // allow server-to-server / postman / ESP32 (no origin)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-farm-id", "device_key"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

/**
 * ✅ Debug: ดูว่าเครื่องไหนยิงเข้า server (ช่วยไล่ ESP32)
 */
app.use((req, _res, next) => {
  // eslint-disable-next-line no-console
  console.log(`[REQ] ${req.method} ${req.originalUrl} from ${req.ip}`);
  next();
});

/**
 * ✅ Basic routes
 */
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

/**
 * ✅ ROUTES (สำคัญ: ต้อง mount ครบ ไม่งั้น frontend จะ 404)
 */
app.use("/api/auth", authRoutes);

// โปรเจกต์คุณใช้ "/api/farms" (ไม่ใช่ /api/farm)
app.use("/api/farms", farmRoutes);
app.use("/api/plants", plantRoutes);
app.use("/api/settings", settingsRoutes);

app.use("/api/sensor", sensorRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/notifications", notificationRoutes);

// device routes (sensor public + commands)
app.use("/api/device", deviceRoutes);

// admin routes (ต้องมี ไม่งั้น /api/admin/farms 404)
app.use("/api/admin", adminRoutes);

app.use("/api/discord", discordRoutes);

// ✅ แยก path ของ device status ออกจาก /api/device เพื่อไม่ชนกัน
app.use("/api/device-status", deviceStatusRoutes);

// alert
app.use("/api/alert-rules", alertRulesRoutes);
app.use("/api/alert-setting", alertSettingRoutes);

// ✅ water usage (ถ้าคุณเพิ่มระบบนี้)
app.use("/api/water-usage", waterUsageRoutes);

/**
 * =========================
 * ✅ Scheduler: create ON commands by schedules (Asia/Bangkok)
 * - รันทุก 30 วิ
 * - ถ้าถึงเวลา/วัน -> สร้าง DeviceCommand (pending)
 * - กันซ้ำด้วย scheduled_key
 * =========================
 */
function getBangkokParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = fmt.formatToParts(d);
  const obj = {};
  for (const p of parts) obj[p.type] = p.value;

  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    dateStr: `${obj.year}-${obj.month}-${obj.day}`, // YYYY-MM-DD
    hhmm: `${obj.hour}:${obj.minute}`, // HH:mm
    dow: weekdayMap[obj.weekday] ?? 0, // 0..6
  };
}

async function runScheduleTick() {
  try {
    const { dateStr, hhmm, dow } = getBangkokParts(new Date());

    const settingsList = await FarmSetting.find({
      watering_schedules: { $exists: true, $ne: [] },
    }).lean();

    for (const s of settingsList) {
      const farm_id = s.farm_id;

      for (const sch of s.watering_schedules || []) {
        if (!sch?.enabled) continue;

        const days = Array.isArray(sch.days) ? sch.days : [];
        if (days.length > 0 && !days.includes(dow)) continue;

        if (String(sch.time) !== hhmm) continue;

        const scheduled_key = `${String(farm_id)}|${dateStr}|${hhmm}`;

        const exists = await DeviceCommand.findOne({
          farm_id,
          scheduled_key,
          command: "ON",
        }).lean();

        if (exists) continue;

        const duration_sec = Math.min(3600, Math.max(1, Number(sch.duration_sec || 30)));

        await DeviceCommand.create({
          farm_id,
          device_id: "pump",
          command: "ON",
          duration_sec,
          status: "pending",
          source: "auto",
          timestamp: new Date(),
          scheduled_key,
        });
      }
    }
  } catch (err) {
    console.error("Scheduler tick error:", err?.message || err);
  }
}

/**
 * ✅ 404 handler (ช่วยไล่บัคหน้าเว็บที่เรียกแล้วได้ 404)
 */
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    method: req.method,
    path: req.originalUrl,
  });
});

/**
 * ✅ error handler (รวม CORS error)
 */
app.use((err, _req, res, _next) => {
  console.error("SERVER ERROR:", err?.message || err);
  res.status(500).json({ error: err?.message || "Server error" });
});

/**
 * =========================
 * ✅ Start server
 * =========================
 */
async function start() {
  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!MONGO_URI) {
    console.error("Missing MONGO_URI in .env");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log("Mongo connected");

  setInterval(runScheduleTick, 30 * 1000);

  const port = process.env.PORT || 3000;

  // ✅ สำคัญ: เปิดรับจากทุก IP เพื่อให้ ESP32 เข้าได้
  app.listen(port, "0.0.0.0", () => console.log(`API running on :${port}`));
}

start().catch((e) => {
  console.error("Startup error:", e);
  process.exit(1);
});
