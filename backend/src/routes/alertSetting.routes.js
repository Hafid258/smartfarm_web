import express from "express";
import FarmAlertSetting from "../models/FarmAlertSetting.js";
import { resolveFarmId } from "../middleware/resolveFarmId.js";

const router = express.Router();

/**
 * ✅ GET /api/alert-settings?farm_id=xxx
 * ดึงค่าตั้งค่าการแจ้งเตือนของฟาร์ม
 */
router.get("/", resolveFarmId, async (req, res) => {
  try {
    const farm_id = req.farmId;

    let setting = await FarmAlertSetting.findOne({ farm_id });

    // ✅ ถ้ายังไม่มี ให้สร้าง default ให้ทันที
    if (!setting) {
      setting = await FarmAlertSetting.create({
        farm_id,
        rules: [
          {
            metric: "temperature",
            enabled: true,
            low: 18,
            high: 35,
            msg_low: "อุณหภูมิต่ำเกินไป ควรตรวจสอบ",
            msg_high: "อุณหภูมิสูงมาก ระวังพืชเฉา",
          },
          {
            metric: "humidity_air",
            enabled: true,
            low: 40,
            high: 90,
            msg_low: "ความชื้นอากาศต่ำมาก",
            msg_high: "ความชื้นสูง เสี่ยงเชื้อรา",
          },
          {
            metric: "soil_moisture",
            enabled: true,
            low: 30,
            high: 80,
            msg_low: "ความชื้นดินต่ำ ควรรดน้ำ",
            msg_high: "ความชื้นดินสูงมาก ระวังรากเน่า",
          },
        ],
      });
    }

    res.json(setting);
  } catch (err) {
    console.error("GET /api/alert-settings error:", err);
    res.status(500).json({ error: err.message || "Failed to load alert settings" });
  }
});

/**
 * ✅ PUT /api/alert-settings?farm_id=xxx
 * บันทึกค่าตั้งค่าการแจ้งเตือนของฟาร์ม
 */
router.put("/", resolveFarmId, async (req, res) => {
  try {
    const farm_id = req.farmId;
    const { rules } = req.body;

    if (!Array.isArray(rules)) {
      return res.status(400).json({ error: "rules must be an array" });
    }

    const payload = {
      rules,
      updated_at: new Date(),
    };

    const setting = await FarmAlertSetting.findOneAndUpdate(
      { farm_id },
      { $set: payload, $setOnInsert: { farm_id } },
      { upsert: true, new: true }
    );

    res.json({ ok: true, setting });
  } catch (err) {
    console.error("PUT /api/alert-settings error:", err);
    res.status(500).json({ error: err.message || "Failed to save alert settings" });
  }
});

export default router;
