import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    farm_id: { type: mongoose.Schema.Types.ObjectId, ref: "Farm", required: true },
    timestamp: { type: Date, required: true },
    vpd: { type: Number, required: true },
    gdd: { type: Number, required: true },
    dew_point: { type: Number, required: true },
    soil_drying_rate: { type: Number, required: true },
  },
  {
    collection: "index_data", // ✅ สำคัญมาก: บังคับให้ใช้ collection ที่มีข้อมูลจริง
  }
);

// ✅ index เพื่อ query เร็วขึ้น
schema.index({ farm_id: 1, timestamp: -1 });

export default mongoose.model("IndexData", schema);
