import mongoose from "mongoose";

const NotificationSettingSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    notify_channel: { type: String, default: "discord" },

    discord_webhook_url: { type: String, default: "" },
    discord_enabled: { type: Boolean, default: false },

    updated_at: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
  }
);

// ✅ สำคัญที่สุด: บังคับชื่อ collection ให้ตรงกับ MongoDB จริง
export default mongoose.model(
  "NotificationSetting",
  NotificationSettingSchema,
  "notification_settings" // ✅ FIX ตัวนี้เท่านั้นจะหาย
);
