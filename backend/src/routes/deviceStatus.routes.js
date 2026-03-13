import express from "express";
import DeviceStatus from "../models/DeviceStatus.js";
import FarmSetting from "../models/FarmSetting.js";
import { resolveFarmId } from "../middleware/resolveFarmId.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

function normalizeKey(v) {
  return String(v || "").trim();
}

function normalizeDeviceRole(v) {
  const role = String(v || "").trim().toLowerCase();
  if (role === "sensor" || role === "control") return role;
  return "";
}

function keyFieldByRole(role) {
  return role === "sensor" ? "sensor_device_key" : "control_device_key";
}

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
        pump_paused: true,

        // Schedule settings
        watering_schedule_enabled: false,
        watering_schedule_time: "06:00",
        watering_schedule_days: [],
        watering_schedules: [],

        // Sampling
        sampling_interval_min: 5,

        // Device auth
        device_key: normalizeKey(device_key),
        sensor_device_key: "",
        control_device_key: "",

        // Audit
        updated_at: new Date(),
      },
    },
    { upsert: true, new: true }
  ).lean();

  return await FarmSetting.findOne({ farm_id }).lean();
}

async function verifyAndSeedRoleKey({ farm_id, setting, device_key, role }) {
  if (!setting) return { ok: false, code: 400, error: "FarmSetting not found", role: "unknown" };

  const incoming = normalizeKey(device_key);
  const roleField = keyFieldByRole(role);
  const roleKey = normalizeKey(setting?.[roleField]);
  const legacyKey = normalizeKey(setting?.device_key);

  if (roleKey) {
    if (roleKey !== incoming) {
      return { ok: false, code: 403, error: `Invalid ${role}_device_key`, role };
    }
    return { ok: true, role };
  }

  // First registration for this role: allow seeding role key.
  // Keep legacy key untouched if it already exists.
  const setPayload = { [roleField]: incoming, updated_at: new Date() };
  if (!legacyKey) setPayload.device_key = incoming;
  await FarmSetting.updateOne(
    { farm_id },
    { $set: setPayload }
  );
  return { ok: true, role };
}

function inferRoleByKey(setting, device_key) {
  const incoming = normalizeKey(device_key);
  const sensorKey = normalizeKey(setting?.sensor_device_key);
  const controlKey = normalizeKey(setting?.control_device_key);
  const legacyKey = normalizeKey(setting?.device_key);

  if (sensorKey && incoming === sensorKey) return "sensor";
  if (controlKey && incoming === controlKey) return "control";
  if (legacyKey && incoming === legacyKey) return "control";
  if (!sensorKey && !controlKey && !legacyKey) return "control";
  return "";
}

/**
 * ✅ PUBLIC: POST /api/device-status/status?farm_id=xxx
 */
router.post("/status", resolveFarmId, async (req, res) => {
  try {
    const farm_id = req.farmId;

    const device_key = normalizeKey(req.body?.device_key || req.query?.device_key);
    const requestedRole = normalizeDeviceRole(req.body?.device_role || req.query?.device_role);
    if (!device_key) return res.status(400).json({ error: "device_key missing" });

    const setting = await ensureFarmSetting(farm_id, device_key);
    const roleToVerify = requestedRole || inferRoleByKey(setting, device_key);
    if (!roleToVerify) return res.status(403).json({ error: "Invalid device_key" });

    const v = await verifyAndSeedRoleKey({
      farm_id,
      setting,
      device_key,
      role: roleToVerify,
    });
    if (!v.ok) return res.status(v.code).json({ error: v.error });

    const update = {
      farm_id,
      device_key,
      device_role: roleToVerify,
      last_seen_at: new Date(),
    };

    // อัปเดตเฉพาะค่าที่ส่งมา เพื่อไม่ให้ข้อมูลเดิมถูกเขียนทับเป็นค่าว่าง
    if (req.body.ip !== undefined && req.body.ip !== null && String(req.body.ip).trim() !== "") {
      update.ip = String(req.body.ip).trim();
    }
    if (req.body.wifi_rssi !== undefined && req.body.wifi_rssi !== null && Number.isFinite(Number(req.body.wifi_rssi))) {
      update.wifi_rssi = Number(req.body.wifi_rssi);
    }
    if (req.body.fw_version !== undefined && req.body.fw_version !== null && String(req.body.fw_version).trim() !== "") {
      update.fw_version = String(req.body.fw_version).trim();
    }
    if (req.body.pump_state !== undefined) {
      update.pump_state = req.body.pump_state === "ON" ? "ON" : "OFF";
    }
    if (req.body.uptime_sec !== undefined && req.body.uptime_sec !== null && Number.isFinite(Number(req.body.uptime_sec))) {
      update.uptime_sec = Number(req.body.uptime_sec);
    }

    if (req.body.light_raw_adc !== undefined) update.light_raw_adc = Number(req.body.light_raw_adc);
    if (req.body.light_percent !== undefined) update.light_percent = Number(req.body.light_percent);
    if (req.body.light_lux !== undefined) update.light_lux = Number(req.body.light_lux);
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
