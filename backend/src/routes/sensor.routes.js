import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { resolveFarmId } from "../middleware/resolveFarmId.js";
import SensorData from "../models/SensorData.js";

const router = express.Router();

router.use(requireAuth, resolveFarmId);


// GET /api/sensor/latest
router.get("/latest", async (req, res) => {
  try {
    const farm_id = String(req.farmId);

    if (!farm_id) return res.status(400).json({ error: "farm_id missing" });

    const latest = await SensorData.findOne({ farm_id }).sort({ timestamp: -1 });
    res.json(latest || null);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch latest sensor data" });
  }
});

// GET /api/sensor/history?limit=120
router.get("/history", async (req, res) => {
  try {
    const farm_id = String(req.farmId);
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

    const list = await SensorData.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit);

    // return ascending for charts
    res.json(list.reverse());
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch sensor history" });
  }
});

export default router;
