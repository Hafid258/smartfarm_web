import mongoose from "mongoose";

/**
 * DeviceCommand
 * - ใช้สำหรับสั่งงานอุปกรณ์ (เช่น ปั๊มน้ำ)
 * - ESP32 จะ poll คำสั่งที่ status="pending" แล้ว ack กลับมาเป็น done/failed
 */

const DeviceCommandSchema = new mongoose.Schema(
  {
    farm_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Farm",
      required: true,
      index: true,
    },

    device_id: { type: String, default: "pump" },

    command: { type: String, enum: ["ON", "OFF"], required: true },

    // ระยะเวลาที่ให้รดน้ำ (วินาที) เฉพาะคำสั่ง ON
    duration_sec: { type: Number, default: 0 },

    // pending = ยังไม่ทำ, done = ทำแล้ว, failed = ทำไม่ได้
    status: {
      type: String,
      enum: ["pending", "done", "failed"],
      default: "pending",
      index: true,
    },

    // แหล่งที่มาของคำสั่ง
    source: {
      type: String,
      enum: ["user", "admin", "auto", "smart"],
      default: "user",
    },

    // เวลาออกคำสั่ง
    timestamp: { type: Date, default: Date.now, index: true },

    // เวลาเสร็จสิ้น (ตอน ack กลับมา)
    completed_at: { type: Date, default: null },

    // ระยะเวลาที่รดจริง (ESP32 ส่งกลับมา)
    actual_duration_sec: { type: Number, default: 0 },

    // กันซ้ำสำหรับ schedule (farm|YYYY-MM-DD|HH:mm)
    scheduled_key: { type: String, default: null, index: true },
  },
  { versionKey: false }
);

// ใช้สำหรับเช็ค pending command เร็ว ๆ
DeviceCommandSchema.index({ farm_id: 1, status: 1, timestamp: 1 });

export default mongoose.model("DeviceCommand", DeviceCommandSchema, "device_commands");
