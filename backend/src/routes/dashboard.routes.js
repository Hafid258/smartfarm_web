import express from "express";
import SensorData from "../models/SensorData.js";
import IndexData from "../models/IndexData.js";
import Notification from "../models/Notification.js";
import { requireAuth } from "../middleware/auth.js";
import { resolveFarmId } from "../middleware/resolveFarmId.js";

const router = express.Router();

/**
 * ✅ Secure all dashboard routes
 * - requireAuth: ต้อง login
 * - resolveFarmId: แปลง farm_id อย่างปลอดภัยเก็บใน req.farmId
 */
router.use(requireAuth, resolveFarmId);
// ✅ Disable cache for dashboard routes (แก้ 304 Not Modified)
router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});


/**
 * =========================
 * Helpers: Index Calculation
 * =========================
 */

// Dew Point (°C) - Magnus formula
function calcDewPoint(t, rh) {
  const a = 17.27;
  const b = 237.7;
  const alpha = (a * t) / (b + t) + Math.log(rh / 100);
  return (b * alpha) / (a - alpha);
}

// VPD (kPa)
function calcVPD(t, rh) {
  const es = 0.6108 * Math.exp((17.27 * t) / (t + 237.3)); // saturation vapor pressure
  const ea = es * (rh / 100); // actual vapor pressure
  return es - ea;
}

// GDD (simple)
function calcGDD(t, baseTemp = 10) {
  return Math.max(0, t - baseTemp);
}

async function distinctMonths(Model, farm_id, field) {
  const res = await Model.aggregate([
    { $match: { farm_id, [field]: { $type: "date" } } },
    {
      $project: {
        ym: {
          $dateToString: { format: "%Y-%m", date: `$${field}` },
        },
      },
    },
    { $group: { _id: "$ym" } },
    { $sort: { _id: -1 } },
  ]);
  return res.map((x) => x._id);
}

/**
 * =========================
 * SENSOR ENDPOINTS
 * =========================
 */

/**
 * ✅ GET /api/dashboard/sensor-latest
 * latest sensor for current farm
 */
router.get("/sensor-latest", async (req, res) => {
  try {
    const farm_id = req.farmId;
    if (!farm_id) return res.status(400).json({ error: "farm_id missing" });

    const latest = await SensorData.findOne({ farm_id })
      .sort({ timestamp: -1 })
      .lean();

    return res.json(latest || null);
  } catch (err) {
    console.error("SENSOR LATEST ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch sensor latest" });
  }
});

/**
 * ✅ GET /api/dashboard/sensor-history?limit=120
 * history for charts (ascending by time)
 */
router.get("/sensor-history", async (req, res) => {
  try {
    const farm_id = req.farmId;
    if (!farm_id) return res.status(400).json({ error: "farm_id missing" });

    const limit = Math.min(parseInt(req.query.limit || "120", 10), 20000);
    const start = req.query.start ? new Date(req.query.start) : null;
    const end = req.query.end ? new Date(req.query.end) : null;

    const filter = { farm_id };
    if (start && !Number.isNaN(start.getTime())) {
      filter.timestamp = { ...(filter.timestamp || {}), $gte: start };
    }
    if (end && !Number.isNaN(end.getTime())) {
      filter.timestamp = { ...(filter.timestamp || {}), $lt: end };
    }

    const docs = await SensorData.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    return res.json(docs.reverse()); // ascending for charts
  } catch (err) {
    console.error("SENSOR HISTORY ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch sensor history" });
  }
});

/**
 * =========================
 * INDEX ENDPOINTS
 * =========================
 */

/**
 * ✅ GET /api/dashboard/index-latest
 */
router.get("/index-latest", async (req, res) => {
  try {
    const farm_id = req.farmId;
    if (!farm_id) return res.status(400).json({ error: "farm_id missing" });

    const latest = await IndexData.findOne({ farm_id })
      .sort({ timestamp: -1 })
      .lean();

    return res.json(latest || null);
  } catch (err) {
    console.error("INDEX LATEST ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch index latest" });
  }
});

/**
 * ✅ GET /api/dashboard/index-history?limit=120
 */
router.get("/index-history", async (req, res) => {
  try {
    const farm_id = req.farmId;
    if (!farm_id) return res.status(400).json({ error: "farm_id missing" });

    const limit = Math.min(parseInt(req.query.limit || "120", 10), 20000);
    const start = req.query.start ? new Date(req.query.start) : null;
    const end = req.query.end ? new Date(req.query.end) : null;

    const filter = { farm_id };
    if (start && !Number.isNaN(start.getTime())) {
      filter.timestamp = { ...(filter.timestamp || {}), $gte: start };
    }
    if (end && !Number.isNaN(end.getTime())) {
      filter.timestamp = { ...(filter.timestamp || {}), $lt: end };
    }

    const docs = await IndexData.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    return res.json(docs.reverse()); // ascending for charts
  } catch (err) {
    console.error("INDEX HISTORY ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch index history" });
  }
});

/**
 * =========================================================
 * ✅ POST /api/dashboard/index/generate?limit=1000
 * สร้าง IndexData จาก SensorData ที่มีอยู่แล้ว (admin only)
 *
 * ใช้เพื่อทำให้กราฟ Index แสดงก่อน โดยยังไม่ต้องใช้ ESP32
 * =========================================================
 */
router.post("/index/generate", async (req, res) => {
  try {
    // ✅ admin only
    if (req.user?.role !== "admin") {
      return res.status(403).json({ error: "admin only" });
    }

    const farm_id = req.farmId;
    if (!farm_id) return res.status(400).json({ error: "farm_id missing" });

    const limit = Math.min(parseInt(req.query.limit || "1000", 10), 20000);

    // ✅ อ่าน sensor (เก่า -> ใหม่)
    const sensors = await SensorData.find({ farm_id })
      .sort({ timestamp: 1 })
      .limit(limit)
      .lean();

    if (!sensors.length) {
      return res.json({ ok: true, inserted: 0, message: "No SensorData found" });
    }

    let inserted = 0;
    let prev = null;

    for (const s of sensors) {
      const ts = new Date(s.timestamp);
      const t = Number(s.temperature || 0);
      const rh = Number(s.humidity_air || 0);
      const soil = Number(s.soil_moisture || 0);

      const dew_point = calcDewPoint(t, rh);
      const vpd = calcVPD(t, rh);
      const gdd = calcGDD(t, 10);

      // soil drying rate = delta soil / time(minutes)
      let soil_drying_rate = 0;
      if (prev) {
        const dtMin = (ts - new Date(prev.timestamp)) / 60000;
        if (dtMin > 0) {
          soil_drying_rate = (Number(prev.soil_moisture || 0) - soil) / dtMin;
        }
      }

      // ✅ กันซ้ำ: ถ้ามี index ของ timestamp นี้แล้ว ข้าม
      const exists = await IndexData.findOne({ farm_id, timestamp: ts })
        .select("_id")
        .lean();

      if (!exists) {
        await IndexData.create({
          farm_id,
          timestamp: ts,
          vpd,
          gdd,
          dew_point,
          soil_drying_rate,
        });
        inserted++;
      }

      prev = s;
    }

    return res.json({
      ok: true,
      inserted,
      total_sensor: sensors.length,
      farm_id,
    });
  } catch (err) {
    console.error("GENERATE INDEX ERROR:", err);
    return res.status(500).json({ error: "Failed to generate index" });
  }
});

/**
 * ✅ GET /api/dashboard/available-months
 * months that have data (sensor/index/notifications)
 */
router.get("/available-months", async (req, res) => {
  try {
    const farm_id = req.farmId;
    if (!farm_id) return res.status(400).json({ error: "farm_id missing" });

    const [sensorMonths, indexMonths, notifMonths] = await Promise.all([
      distinctMonths(SensorData, farm_id, "timestamp"),
      distinctMonths(IndexData, farm_id, "timestamp"),
      distinctMonths(Notification, farm_id, "timestamp"),
    ]);

    const set = new Set([...sensorMonths, ...indexMonths, ...notifMonths]);
    const months = Array.from(set).sort((a, b) => (a < b ? 1 : -1));

    return res.json({ months });
  } catch (err) {
    console.error("AVAILABLE MONTHS ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch available months" });
  }
});

export default router;
