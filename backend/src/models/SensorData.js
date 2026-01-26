import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    farm_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Farm",
      required: true,
      index: true,
    },
    timestamp: { type: Date, required: true, index: true },

    temperature: { type: Number, required: true },
    humidity_air: { type: Number, required: true },

    soil_moisture: { type: Number, required: true },
    soil_raw_adc: { type: Number },

    // ✅ LDR Light
    light_raw_adc: { type: Number },     // 0..4095
    light_percent: { type: Number },     // 0..100
    light_lux: { type: Number },         // lux
  },
  { versionKey: false }
);

// ชื่อ collection ของคุณคือ "sensor_data"
export default mongoose.model("SensorData", schema, "sensor_data");
