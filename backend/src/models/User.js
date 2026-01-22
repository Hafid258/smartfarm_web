import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password_hash: { type: String, required: true },

  email: { type: String, required: true, unique: true },
  phone: { type: String },

  role: { type: String, enum: ["admin", "user"], default: "user" },
  is_active: { type: Boolean, default: false },

  farm_id: { type: mongoose.Schema.Types.ObjectId, ref: "Farm" },

  created_at: { type: Date, default: Date.now },
  last_login: { type: Date }
});

export default mongoose.model("User", userSchema);
