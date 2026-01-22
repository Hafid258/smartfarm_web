import jwt from "jsonwebtoken";
import User from "../models/User.js";

/**
 * ✅ รองรับทั้ง import แบบ
 * - import auth from "../middleware/auth.js"
 * - import { requireAuth, requireAdmin } from "../middleware/auth.js"
 */

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.user_id).lean();

    if (!user) return res.status(401).json({ error: "Invalid token" });

    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin only" });
  next();
}

// ✅ ทำให้ import default ใช้ได้ด้วย (กันไฟล์เก่าพัง)
export default requireAuth;
