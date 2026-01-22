import mongoose from "mongoose";
const farmSchema = new mongoose.Schema({
  farm_name: { type: String, required: true }
});
export default mongoose.model("Farm", farmSchema);
