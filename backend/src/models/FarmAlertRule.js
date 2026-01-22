import mongoose from "mongoose";

const FarmAlertRuleSchema = new mongoose.Schema(
  {
    farm_id: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    metric: {
      type: String,
      required: true,
      enum: [
        "temperature",
        "humidity_air",
        "soil_moisture",
        "vpd",
        "gdd",
        "dew_point",
        "soil_drying_rate",
      ],
      index: true,
    },

    operator: {
      type: String,
      required: true,
      enum: ["lt", "gt"], // lt = ต่ำกว่า, gt = สูงกว่า
    },

    threshold: { type: Number, required: true },

    message: { type: String, required: true },

    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("FarmAlertRule", FarmAlertRuleSchema, "farm_alert_rules");
