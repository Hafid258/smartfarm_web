import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    farm_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Farm",
      required: true,
      index: true, // ✅ ใช้ index ที่ field
    },

    started_at: { type: Date, required: true, index: true },
    ended_at: { type: Date, required: true },

    duration_sec: { type: Number, required: true },

    liters_est: { type: Number, default: 0 },

    source: { type: String, enum: ["user", "admin", "auto", "schedule"], default: "auto" },

    command_id: { type: mongoose.Schema.Types.ObjectId, ref: "DeviceCommand" },
  },
  { collection: "water_usage", timestamps: true }
);

// ✅ index compound เพื่อดึงล่าสุดเร็ว (ไม่ซ้ำกับ field index)
schema.index({ farm_id: 1, started_at: -1 });

export default mongoose.model("WaterUsage", schema);
