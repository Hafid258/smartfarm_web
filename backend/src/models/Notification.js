import mongoose from "mongoose";
const schema = new mongoose.Schema({
  farm_id: { type: mongoose.Schema.Types.ObjectId, ref: "Farm", required: true },
  timestamp: { type: Date, required: true },
  alert_type: { type: String, required: true },
  details: { type: String, required: true },
  severity: { type: String, enum:["low","medium","high"], default:"low" },
  is_read: { type: Boolean, default: false },
  sent_to: { type: String, default: "discord" },
  sent_status: { type: String, default: "success" }
});
export default mongoose.model("Notification", schema);
