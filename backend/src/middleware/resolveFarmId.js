import mongoose from "mongoose";

/**
 * ✅ resolveFarmId middleware
 * - ดึง farm_id จาก query/body/params/header (x-farm-id)
 * - validate ObjectId
 * - set req.farmId เป็น ObjectId พร้อมใช้งาน
 */
export function resolveFarmId(req, res, next) {
  try {
    const farmIdRaw =
      req.query?.farm_id ||
      req.body?.farm_id ||
      req.params?.farm_id ||
      req.headers["x-farm-id"];

    if (!farmIdRaw) {
      return res.status(400).json({ error: "farm_id missing" });
    }

    const farmIdStr = String(farmIdRaw).trim();

    if (!mongoose.isValidObjectId(farmIdStr)) {
      return res.status(400).json({ error: "Invalid farm_id format" });
    }

    req.farmId = new mongoose.Types.ObjectId(farmIdStr);
    next();
  } catch (err) {
    console.error("resolveFarmId middleware error:", err);
    return res.status(500).json({ error: "Failed to resolve farm_id" });
  }
}
