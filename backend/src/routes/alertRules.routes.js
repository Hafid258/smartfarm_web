import express from "express";
import FarmAlertRule from "../models/FarmAlertRule.js";
import { resolveFarmId } from "../middleware/resolveFarmId.js";

const router = express.Router();

/**
 * ✅ GET /api/alert-rules?farm_id=xxx
 * ดึงรายการกฎแจ้งเตือนทั้งหมดของฟาร์ม
 */
router.get("/", resolveFarmId, async (req, res) => {
  try {
    const farm_id = req.farmId;
    const rules = await FarmAlertRule.find({ farm_id }).sort({ createdAt: -1 });
    res.json(rules);
  } catch (err) {
    console.error("GET /api/alert-rules error:", err);
    res.status(500).json({ error: err.message || "Failed to load rules" });
  }
});

/**
 * ✅ POST /api/alert-rules?farm_id=xxx
 * สร้างกฎใหม่
 */
router.post("/", resolveFarmId, async (req, res) => {
  try {
    const farm_id = req.farmId;
    const { metric, operator, threshold, message, enabled } = req.body;

    if (!metric || !operator || threshold === undefined || !message) {
      return res.status(400).json({ error: "metric, operator, threshold, message are required" });
    }

    const rule = await FarmAlertRule.create({
      farm_id,
      metric,
      operator,
      threshold: Number(threshold),
      message: String(message),
      enabled: enabled !== undefined ? Boolean(enabled) : true,
    });

    res.json({ ok: true, rule });
  } catch (err) {
    console.error("POST /api/alert-rules error:", err);
    res.status(500).json({ error: err.message || "Failed to create rule" });
  }
});

/**
 * ✅ PUT /api/alert-rules/:id?farm_id=xxx
 * แก้ไขกฎ
 */
router.put("/:id", resolveFarmId, async (req, res) => {
  try {
    const farm_id = req.farmId;
    const { id } = req.params;

    const { metric, operator, threshold, message, enabled } = req.body;

    const rule = await FarmAlertRule.findOneAndUpdate(
      { _id: id, farm_id },
      {
        $set: {
          metric,
          operator,
          threshold: threshold !== undefined ? Number(threshold) : undefined,
          message,
          enabled: enabled !== undefined ? Boolean(enabled) : undefined,
        },
      },
      { new: true }
    );

    if (!rule) return res.status(404).json({ error: "Rule not found" });

    res.json({ ok: true, rule });
  } catch (err) {
    console.error("PUT /api/alert-rules/:id error:", err);
    res.status(500).json({ error: err.message || "Failed to update rule" });
  }
});

/**
 * ✅ DELETE /api/alert-rules/:id?farm_id=xxx
 * ลบกฎ
 */
router.delete("/:id", resolveFarmId, async (req, res) => {
  try {
    const farm_id = req.farmId;
    const { id } = req.params;

    const deleted = await FarmAlertRule.findOneAndDelete({ _id: id, farm_id });

    if (!deleted) return res.status(404).json({ error: "Rule not found" });

    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/alert-rules/:id error:", err);
    res.status(500).json({ error: err.message || "Failed to delete rule" });
  }
});

export default router;
