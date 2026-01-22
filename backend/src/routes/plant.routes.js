import mongoose from "mongoose";
import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { resolveFarmId } from "../middleware/resolveFarmId.js";
import Plant from "../models/Plant.js";

const router = express.Router();

// ✅ ทุก route ต้อง login + resolve farm_id
router.use(requireAuth, resolveFarmId);

// ✅ GET /api/plants (โหลด plant ของฟาร์ม)
router.get("/", async (req, res) => {
  try {
    const farmObjectId = new mongoose.Types.ObjectId(req.farmId);

    const plant = await Plant.findOne({ farm_id: farmObjectId });

    // ✅ frontend ของคุณ expect res.data เป็น plant object (ไม่ใช่ {ok:true, plant})
    // ดังนั้นคืน plant ตรง ๆ ให้เหมือนเดิม
    res.json(plant || null);
  } catch (err) {
    console.error("GET /api/plants error:", err);
    res.status(500).json({ error: err.message || "Failed to load plant" });
  }
});

// ✅ POST /api/plants (บันทึก/เพิ่มแบบ upsert)
router.post("/", async (req, res) => {
  try {
    const farmObjectId = new mongoose.Types.ObjectId(req.farmId);

    const {
      plant_name,
      plant_type,
      planting_date,
      base_temperature,
      temp,
      rh,
      soil,
    } = req.body;

    const payload = {
      plant_name,
      plant_type,
      base_temperature: Number(base_temperature),
    };

    // ✅ ป้องกันส่ง undefined/null ให้ validator
    if (typeof temp !== "undefined") payload.temp = Number(temp);
    if (typeof rh !== "undefined") payload.rh = Number(rh);
    if (typeof soil !== "undefined") payload.soil = Number(soil);

    if (planting_date) {
      const d = new Date(planting_date);
      if (!isNaN(d.getTime())) payload.planting_date = d;
    }

    const plant = await Plant.findOneAndUpdate(
      { farm_id: farmObjectId },
      {
        $set: payload,
        $setOnInsert: { farm_id: farmObjectId },
      },
      { upsert: true, new: true }
    );

    // ✅ frontend ไม่ได้ใช้ response แต่คืนไว้เพื่อ debug
    res.json(plant);
  } catch (err) {
    console.error("POST /api/plants error:", err);

    res.status(500).json({
      error: err.message || "Failed to save plant",
      mongo_code: err.code || null,
      mongo_codeName: err.codeName || null,
      details: err?.errInfo?.details || null,
    });
  }
});

export default router;
