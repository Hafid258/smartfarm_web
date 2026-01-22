import mongoose from "mongoose";

const DeviceStatusSchema = new mongoose.Schema(
  {
    farm_id: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    // ✅ key ของอุปกรณ์ (ผูกกับ FarmSetting หรือให้แต่ละ device มี key ของตัวเองก็ได้)
    device_key: { type: String, required: true, index: true },

    ip: { type: String, default: "" },
    wifi_rssi: { type: Number, default: null },

    fw_version: { type: String, default: "" },

    pump_state: { type: String, enum: ["ON", "OFF"], default: "OFF" },

    dht_ok: { type: Boolean, default: true },
    soil_ok: { type: Boolean, default: true },
    light_ok: { type: Boolean, default: true },

    light_raw_adc: { type: Number, default: null },
    light_percent: { type: Number, default: null },

    last_seen_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// ✅ ฟาร์มเดียว + device_key เดียว ต้อง unique
DeviceStatusSchema.index({ farm_id: 1, device_key: 1 }, { unique: true });

export default mongoose.model("DeviceStatus", DeviceStatusSchema);
