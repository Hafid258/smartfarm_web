import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { resolveFarmId } from "../middleware/resolveFarmId.js";
import FarmSetting from "../models/FarmSetting.js";

const router = express.Router();
router.use(requireAuth, resolveFarmId);

function normalizeDays(days) {
  if (!Array.isArray(days)) return [];
  const out = [];
  for (const d of days) {
    const n = Number(d);
    if (Number.isInteger(n) && n >= 0 && n <= 6 && !out.includes(n)) out.push(n);
  }
  return out.sort((a, b) => a - b);
}

function normalizeTimeHHmm(t) {
  if (typeof t !== "string") return "06:00";
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "06:00";
  const hh = Math.min(23, Math.max(0, Number(m[1])));
  const mm = Math.min(59, Math.max(0, Number(m[2])));
  return String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}

function normalizeSchedules(schedules) {
  if (!Array.isArray(schedules)) return [];
  return schedules.map((s) => ({
    enabled: Boolean(s?.enabled),
    time: normalizeTimeHHmm(s?.time || "06:00"),
    days: normalizeDays(s?.days),
    duration_sec: Math.min(3600, Math.max(1, Number(s?.duration_sec || 30))),
  }));
}

// GET /api/settings/my
router.get("/my", async (req, res) => {
  try {
    const farm_id = req.farmId;
    if (!farm_id) return res.status(400).json({ error: "farm_id missing" });

    const doc = await FarmSetting.findOne({ farm_id }).lean();
    res.json(doc || null);
  } catch (err) {
    res.status(500).json({ error: "Failed to load settings" });
  }
});

// POST /api/settings/my
router.post("/my", async (req, res) => {
  try {
    const farm_id = req.farmId;
    if (!farm_id) return res.status(400).json({ error: "farm_id missing" });

    const payload = {
      device_key: String(req.body.device_key || ""),

      pump_flow_rate_lpm: Number(req.body.pump_flow_rate_lpm || 0),

      auto_soil_enabled: Boolean(req.body.auto_soil_enabled),
      auto_soil_start_at: Number(req.body.auto_soil_start_at || 35),
      auto_soil_stop_at: Number(req.body.auto_soil_stop_at || 50),
      watering_duration_sec: Number(req.body.watering_duration_sec || 30),
      watering_cooldown_min: Number(req.body.watering_cooldown_min || 5),

      watering_schedules: normalizeSchedules(req.body.watering_schedules),

      sampling_interval_min: Number(req.body.sampling_interval_min || 5),

      updated_by: req.user?._id,
      updated_at: new Date(),
    };

    const updated = await FarmSetting.findOneAndUpdate(
      { farm_id },
      { $set: payload },
      { upsert: true, new: true }
    );

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to save settings", detail: err.message });
  }
});

export default router;
