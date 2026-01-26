import express from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { resolveFarmId } from "../middleware/resolveFarmId.js";

import DeviceCommand from "../models/DeviceCommand.js";
import SensorData from "../models/SensorData.js";
import IndexData from "../models/IndexData.js";
import FarmSetting from "../models/FarmSetting.js";
import Notification from "../models/Notification.js";
import NotificationSetting from "../models/NotificationSetting.js";
import User from "../models/User.js";

const router = express.Router();

function asObjectIdOrNull(id) {
  if (!id) return null;
  const s = String(id);
  if (mongoose.Types.ObjectId.isValid(s)) return new mongoose.Types.ObjectId(s);
  return null;
}

function farmQueryAnyType(farm_id) {
  const oid = asObjectIdOrNull(farm_id);
  return oid ? { $or: [{ farm_id: oid }, { farm_id: String(farm_id) }] } : { farm_id: String(farm_id) };
}

function farmIdForStore(farm_id) {
  const oid = asObjectIdOrNull(farm_id);
  return oid || String(farm_id);
}

// Dew Point (°C)
function calcDewPoint(t, rh) {
  const a = 17.27;
  const b = 237.7;
  const alpha = (a * t) / (b + t) + Math.log(rh / 100);
  return (b * alpha) / (a - alpha);
}

// VPD (kPa)
function calcVPD(t, rh) {
  const es = 0.6108 * Math.exp((17.27 * t) / (t + 237.3));
  const ea = es * (rh / 100);
  return es - ea;
}

function calcGDD(t, baseTemp = 10) {
  return Math.max(0, t - baseTemp);
}

async function sendDiscord(url, content) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Discord send failed: ${text || resp.status}`);
  }
}

async function notifyZeroValueIfNeeded(farm_id, fieldKey, fieldLabel, count, since) {
  const farmObjectId = asObjectIdOrNull(farm_id);
  const alertType = `sensor_zero_${fieldKey}`;

  if (farmObjectId) {
    const existing = await Notification.findOne({
      farm_id: farmObjectId,
      alert_type: alertType,
      timestamp: { $gte: since },
    }).lean();
    if (existing) return;
  }

  const message = `⚠️ ตรวจพบค่า ${fieldLabel} เป็น 0 มากกว่า 5 ครั้งใน 30 นาที (count=${count})`;

  let sentCount = 0;
  let failedCount = 0;

  if (farmObjectId) {
    const users = await User.find({ farm_id: farmObjectId }).select("_id").lean();
    const userIds = users.map((u) => u._id);
    if (userIds.length) {
      const settings = await NotificationSetting.find({
        user_id: { $in: userIds },
        discord_enabled: true,
      }).lean();

      for (const s of settings) {
        const url = String(s.discord_webhook_url || "").trim();
        if (!url.startsWith("https://discord.com/api/webhooks/")) continue;
        try {
          await sendDiscord(url, message);
          sentCount += 1;
        } catch (err) {
          failedCount += 1;
        }
      }
    }
  }

  if (farmObjectId) {
    await Notification.create({
      farm_id: farmObjectId,
      timestamp: new Date(),
      alert_type: alertType,
      details: message,
      severity: "medium",
      sent_to: "discord",
      sent_status: sentCount > 0 ? "success" : "failed",
    });
  }
}

async function checkZeroValuesAndNotify(farm_id) {
  const since = new Date(Date.now() - 30 * 60 * 1000);
  const baseFilter = { ...farmQueryAnyType(farm_id), timestamp: { $gte: since } };

  const fields = [
    { key: "temperature", label: "อุณหภูมิ" },
    { key: "humidity_air", label: "ความชื้นอากาศ" },
    { key: "soil_moisture", label: "ความชื้นดิน" },
  ];

  for (const f of fields) {
    const count = await SensorData.countDocuments({
      ...baseFilter,
      [f.key]: 0,
    });

    if (count > 5) {
      await notifyZeroValueIfNeeded(farm_id, f.key, f.label, count, since);
    }
  }
}

/**
 * =========================
 * ✅ PUBLIC DEVICE ENDPOINTS (ESP32)
 * =========================
 */

// POST /api/device/sensor
router.post("/sensor", async (req, res) => {
  try {
    const { device_key, farm_id } = req.body;

    if (!device_key) return res.status(400).json({ error: "device_key missing" });
    if (!farm_id) return res.status(400).json({ error: "farm_id missing" });

    const setting = await FarmSetting.findOne(farmQueryAnyType(farm_id)).lean();
    if (!setting) return res.status(400).json({ error: "FarmSetting not found" });

    if (!setting.device_key || String(setting.device_key) !== String(device_key)) {
      return res.status(403).json({ error: "Invalid device_key" });
    }

    const ts = req.body.timestamp ? new Date(req.body.timestamp) : new Date();

    const temperature = Number(req.body.temperature ?? 0);
    const humidity_air = Number(req.body.humidity_air ?? 0);
    const soil_moisture = Number(req.body.soil_moisture ?? 0);
    const soil_raw_adc = Number(req.body.soil_raw_adc ?? 0);

    // ✅ แสง
    const light_percent = Number(req.body.light_percent ?? 0);
    const light_raw_adc = Number(req.body.light_raw_adc ?? 0);
    const light_lux = req.body.light_lux !== undefined ? Number(req.body.light_lux) : null;

    const storeFarmId = farmIdForStore(farm_id);

    // 1) SensorData
    const sensorDoc = await SensorData.create({
      farm_id: storeFarmId,
      timestamp: ts,
      temperature,
      humidity_air,
      soil_moisture,
      soil_raw_adc,
      light_percent,
      light_raw_adc,
      light_lux,
    });

    // 2) IndexData
    const dew_point = calcDewPoint(temperature, humidity_air);
    const vpd = calcVPD(temperature, humidity_air);
    const gdd = calcGDD(temperature, 10);

    const prev = await SensorData.findOne({
      ...farmQueryAnyType(farm_id),
      timestamp: { $lt: ts },
    })
      .sort({ timestamp: -1 })
      .lean();

    let soil_drying_rate = 0;
    if (prev) {
      const dtMin = (ts - new Date(prev.timestamp)) / 60000;
      if (dtMin > 0) soil_drying_rate = (Number(prev.soil_moisture) - soil_moisture) / dtMin;
    }

    await IndexData.create({
      farm_id: storeFarmId,
      timestamp: ts,
      vpd,
      gdd,
      dew_point,
      soil_drying_rate,
    });

    try {
      await checkZeroValuesAndNotify(farm_id);
    } catch (notifyErr) {
      console.warn("ZERO VALUE NOTIFY ERROR:", notifyErr);
    }

    return res.json({ ok: true, sensor_id: sensorDoc._id });
  } catch (err) {
    console.error("DEVICE SENSOR ERROR:", err);
    return res.status(500).json({ error: err?.message || "Failed to save sensor" });
  }
});

// GET /api/device/commands/poll
router.get("/commands/poll", async (req, res) => {
  try {
    const { device_key, farm_id } = req.query;

    if (!device_key) return res.status(400).json({ error: "device_key missing" });
    if (!farm_id) return res.status(400).json({ error: "farm_id missing" });

    const setting = await FarmSetting.findOne(farmQueryAnyType(farm_id)).lean();
    if (!setting) return res.status(400).json({ error: "FarmSetting not found" });

    if (!setting.device_key || String(setting.device_key) !== String(device_key)) {
      return res.status(403).json({ error: "Invalid device_key" });
    }

    const cmd = await DeviceCommand.findOne({
      ...farmQueryAnyType(farm_id),
      status: "pending",
    })
      .sort({ timestamp: -1 })
      .lean();

    return res.json(cmd || null);
  } catch (err) {
    console.error("DEVICE POLL ERROR:", err);
    return res.status(500).json({ error: err?.message || "Failed to poll device commands" });
  }
});

// POST /api/device/commands/ack
router.post("/commands/ack", async (req, res) => {
  try {
    const { device_key, farm_id, command_id, status } = req.body;

    if (!device_key) return res.status(400).json({ error: "device_key missing" });
    if (!farm_id) return res.status(400).json({ error: "farm_id missing" });
    if (!command_id) return res.status(400).json({ error: "command_id missing" });

    const setting = await FarmSetting.findOne(farmQueryAnyType(farm_id)).lean();
    if (!setting) return res.status(400).json({ error: "FarmSetting not found" });

    if (!setting.device_key || String(setting.device_key) !== String(device_key)) {
      return res.status(403).json({ error: "Invalid device_key" });
    }

    const nextStatus = status === "failed" ? "failed" : "done";

    await DeviceCommand.updateOne(
      { _id: command_id, ...farmQueryAnyType(farm_id) },
      { $set: { status: nextStatus, completed_at: new Date() } }
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("DEVICE ACK ERROR:", err);
    return res.status(500).json({ error: err?.message || "Failed to ack command" });
  }
});

/**
 * =========================
 * ✅ WEB ENDPOINTS (JWT)
 * =========================
 */

const secured = express.Router();
secured.use(requireAuth, resolveFarmId);

// POST /api/device/command
secured.post("/command", async (req, res) => {
  try {
    const farm_id = req.farmId;
    if (!farm_id) return res.status(400).json({ error: "farm_id missing" });

    const { command, duration_sec } = req.body;
    if (!command) return res.status(400).json({ error: "command required" });

    const storeFarmId = farmIdForStore(farm_id);

    const doc = await DeviceCommand.create({
      farm_id: storeFarmId,
      device_id: req.body.device_id || "pump",
      command,
      duration_sec: duration_sec ? Number(duration_sec) : undefined,
      status: "pending",
      source: req.user?.role || "user",
      timestamp: new Date(),
    });

    res.json({ message: "Command queued", command: doc });
  } catch (err) {
    console.error("DEVICE COMMAND ERROR:", err);
    res.status(500).json({ error: err?.message || "Failed to send device command" });
  }
});

// GET /api/device/commands
secured.get("/commands", async (req, res) => {
  try {
    const farm_id = req.farmId;
    if (!farm_id) return res.status(400).json({ error: "farm_id missing" });

    const limit = Math.min(parseInt(req.query.limit || "200", 10), 1000);

    const logs = await DeviceCommand.find(farmQueryAnyType(farm_id))
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    res.json(logs);
  } catch (err) {
    console.error("DEVICE LOG ERROR:", err);
    res.status(500).json({ error: err?.message || "Failed to fetch device commands" });
  }
});

router.use("/", secured);

export default router;
