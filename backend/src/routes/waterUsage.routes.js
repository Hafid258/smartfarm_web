import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { resolveFarmId } from "../middleware/resolveFarmId.js";
import WaterUsage from "../models/WaterUsage.js";

const router = express.Router();
router.use(requireAuth, resolveFarmId);

// GET /api/water-usage?limit=200&from=2026-01-01&to=2026-01-31
router.get("/", async (req, res) => {
  try {
    const farm_id = req.farmId;
    if (!farm_id) return res.status(400).json({ error: "farm_id missing" });

    const limit = Math.min(parseInt(req.query.limit || "200", 10), 1000);

    const q = { farm_id };

    if (req.query.from) q.started_at = { ...(q.started_at || {}), $gte: new Date(req.query.from) };
    if (req.query.to) q.started_at = { ...(q.started_at || {}), $lte: new Date(req.query.to) };

    const rows = await WaterUsage.find(q).sort({ started_at: -1 }).limit(limit).lean();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load water usage", detail: err.message });
  }
});

export default router;
