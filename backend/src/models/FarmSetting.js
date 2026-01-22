import mongoose from "mongoose";

const scheduleSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: true },
    time: { type: String, default: "06:00" }, // "HH:mm"
    days: { type: [Number], default: [] }, // 0..6 (Sun..Sat)
    duration_sec: { type: Number, default: 30 },
  },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    farm_id: { type: mongoose.Schema.Types.ObjectId, ref: "Farm", required: true, unique: true },

    // device key ที่ ESP32 ต้องส่งมาให้ตรง
    device_key: { type: String, default: "123456789" },

    // thresholds (รองรับทั้งชื่อเก่า/ใหม่)
    temp_threshold: { type: Number, default: 35 },
    rh_threshold: { type: Number, default: 90 },
    soil_threshold: { type: Number, default: 35 },

    temp: { type: Number, default: 35 },
    rh: { type: Number, default: 90 },
    soil: { type: Number, default: 35 },

    sampling_interval: { type: Number, default: 1 }, // นาที (ชื่อเก่า)
    sampling_interval_min: { type: Number, default: 1 }, // นาที (ชื่อใหม่)

    // watering auto
    watering_duration_sec: { type: Number, default: 30 },
    watering_cooldown_min: { type: Number, default: 10 },

    // schedule (legacy)
    watering_schedule_enabled: { type: Boolean, default: false },
    watering_schedule_time: { type: String, default: "06:00" },
    watering_schedule_days: { type: [Number], default: [] },

    // schedule (new)
    watering_schedules: { type: [scheduleSchema], default: [] },

    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

schema.pre("save", function (next) {
  this.updated_at = new Date();
  next();
});

export default mongoose.model("FarmSetting", schema, "farm_settings");
