import mongoose from "mongoose";

const AlertRuleSchema = new mongoose.Schema(
  {
    metric: {
      type: String,
      required: true,
      enum: [
        "temperature",
        "humidity_air",
        "soil_moisture",
        "vpd",
        "dew_point",
        "gdd",
        "soil_drying_rate",
      ],
    },

    enabled: { type: Boolean, default: true },

    // threshold
    low: { type: Number, default: null },
    high: { type: Number, default: null },

    // messages
    msg_low: { type: String, default: "" },
    msg_high: { type: String, default: "" },
  },
  { _id: false }
);

const FarmAlertSettingSchema = new mongoose.Schema(
  {
    farm_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
      index: true,
    },

    rules: { type: [AlertRuleSchema], default: [] },

    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

export default mongoose.model(
  "FarmAlertSetting",
  FarmAlertSettingSchema,
  "farm_alert_settings"
);
