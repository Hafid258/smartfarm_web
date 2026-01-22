import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { resolveFarmId } from "../middleware/resolveFarmId.js";
import Notification from "../models/Notification.js";

const router = express.Router();

router.use(requireAuth, resolveFarmId);

// GET /api/notifications?limit=200
router.get("/", async (req, res) => {
  try {
    const farm_id = req.farmId;
    if (!farm_id) return res.status(400).json({ error: "farm_id missing" });

    const limit = Math.min(parseInt(req.query.limit || "200", 10), 20000);
    const start = req.query.start ? new Date(req.query.start) : null;
    const end = req.query.end ? new Date(req.query.end) : null;

    const filter = { farm_id };
    if (start && !Number.isNaN(start.getTime())) {
      filter.timestamp = { ...(filter.timestamp || {}), $gte: start };
    }
    if (end && !Number.isNaN(end.getTime())) {
      filter.timestamp = { ...(filter.timestamp || {}), $lt: end };
    }

    const list = await Notification.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit);

    res.json(list);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// PUT /api/notifications/:id/read
router.put("/:id/read", async (req, res) => {
  try {
    const farm_id = req.farmId;
    if (!farm_id) return res.status(400).json({ error: "farm_id missing" });

    const updated = await Notification.findOneAndUpdate(
      { _id: req.params.id, farm_id }, // ✅ ownership enforced
      { $set: { is_read: true } },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: "Notification not found" });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update notification" });
  }
});

export default router;
