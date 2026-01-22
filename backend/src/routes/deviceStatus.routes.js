import express from "express";
import DeviceStatus from "../models/DeviceStatus.js";
import FarmSetting from "../models/FarmSetting.js";
import { resolveFarmId } from "../middleware/resolveFarmId.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

async function ensureFarmSetting(farm_id, device_key) {
  await FarmSetting.findOneAndUpdate(
    { farm_id },
    {
      $setOnInsert: {
        farm_id,

        // Threshold settings
        temp: 35,
        rh: 85,
        soil: 30,

        // Pump settings
        watering_duration_sec: 10,
        watering_cooldown_min: 30,

        // Schedule settings
        watering_schedule_enabled: false,
        watering_schedule_time: "06:00",
        watering_schedule_days: [],
        watering_schedules: [],

        // Sampling
        sampling_interval_min: 5,

        // Device auth
        device_key: String(device_key || ""),

        // Audit
        updated_at: new Date(),
      },
    },
    { upsert: true, new: true }
  ).lean();

  return await FarmSetting.findOne({ farm_id }).lean();
}

function verifyDeviceKey(setting, device_key) {
  if (!setting) return { ok: false, code: 400, error: "FarmSetting not found" };

  if (!setting.device_key || String(setting.device_key).trim() === "") return { ok: true, firstSet: true };

  if (String(setting.device_key) !== String(device_key)) return { ok: false, code: 403, error: "Invalid device_key" };

  return { ok: true, firstSet: false };
}

/**
 * ✅ PUBLIC: POST /api/device-status/status?farm_id=xxx
 */
router.post("/status", resolveFarmId, async (req, res) => {
  try {
    const farm_id = req.farmId;

    const device_key = String(req.body.device_key || "").trim();
    if (!device_key) return res.status(400).json({ error: "device_key missing" });

    const setting = await ensureFarmSetting(farm_id, device_key);
    const v = verifyDeviceKey(setting, device_key);
    if (!v.ok) return res.status(v.code).json({ error: v.error });

    if (v.firstSet) {
      await FarmSetting.updateOne({ farm_id }, { $set: { device_key: String(device_key), updated_at: new Date() } });
    }

    const update = {
      farm_id,
      device_key,
      ip: String(req.body.ip || ""),
      wifi_rssi: req.body.wifi_rssi ?? null,
      fw_version: String(req.body.fw_version || ""),
      pump_state: req.body.pump_state === "ON" ? "ON" : "OFF",
      uptime_sec: req.body.uptime_sec ?? null,
      last_seen_at: new Date(),
    };

    if (req.body.light_raw_adc !== undefined) update.light_raw_adc = Number(req.body.light_raw_adc);
    if (req.body.light_percent !== undefined) update.light_percent = Number(req.body.light_percent);
    if (req.body.light_ok !== undefined) update.light_ok = Boolean(req.body.light_ok);

    const doc = await DeviceStatus.findOneAndUpdate(
      { farm_id, device_key },
      { $set: update },
      { upsert: true, new: true }
    );

    return res.json({ ok: true, status: doc });
  } catch (err) {
    console.error("POST /api/device-status/status error:", err);
    return res.status(500).json({ error: err?.message || "Failed to save device status" });
  }
});

/**
 * ✅ WEB (secured): GET /api/device-status/status?farm_id=xxx
 */
router.get("/status", requireAuth, resolveFarmId, async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");

    const farm_id = req.farmId;
    const devices = await DeviceStatus.find({ farm_id }).sort({ last_seen_at: -1 }).lean();
    res.json(devices);
  } catch (err) {
    console.error("GET /api/device-status/status error:", err);
    res.status(500).json({ error: err?.message || "Failed to fetch device status" });
  }
});

export default router;
