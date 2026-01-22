import mongoose from "mongoose";
const schema = new mongoose.Schema({
  farm_id: { type: mongoose.Schema.Types.ObjectId, ref: "Farm", required: true, unique: true },
  plant_name: { type: String, default: "Default Plant" },
  plant_type: { type: String, default: "" },
  planting_date: { type: Date },
  base_temperature: { type: Number, default: 10 }
});
export default mongoose.model("Plant", schema);
