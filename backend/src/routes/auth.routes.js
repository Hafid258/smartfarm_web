import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import User from "../models/User.js";
import Farm from "../models/Farm.js";
import { requireAuth } from "../middleware/auth.js"; // ✅ สำคัญมาก

const router = express.Router();
const s = (v) => (typeof v === "string" ? v.trim() : "");

router.post("/register", async (req, res) => {
  try {
    const username = s(req.body.username);
    const password = s(req.body.password);
    const email = s(req.body.email).toLowerCase();
    const phone = s(req.body.phone);

    if (!username || !password || !email) {
      return res.status(400).json({ error: "กรุณากรอก username / password / email ให้ครบ" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" });
    }

    const exist = await User.findOne({ $or: [{ username }, { email }] }).lean();
    if (exist) return res.status(400).json({ error: "username หรือ email ถูกใช้แล้ว" });

    // ✅ validator บังคับ farm_id -> ใช้ฟาร์มแรกในระบบเป็น default
    const farm = await Farm.findOne().sort({ createdAt: 1 }).lean();
    if (!farm) {
      return res.status(400).json({ error: "ยังไม่มีฟาร์มในระบบ กรุณาให้ Admin สร้างฟาร์มก่อน" });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      password_hash,
      email,
      phone,
      role: "user",
      created_at: new Date(),

      // ✅ ถ้าอยากให้สมัครแล้ว login ได้ทันที ให้เปลี่ยนเป็น true
      is_active: false,

      farm_id: farm._id,
    });

    return res.json({ ok: true, message: "สมัครสำเร็จ กรุณารอ Admin อนุมัติ", user_id: user._id });
  } catch (e) {
    console.error("REGISTER ERROR:", e);

    if (e?.code === 11000) {
      return res.status(400).json({ error: "username หรือ email ถูกใช้แล้ว" });
    }
    if (e?.code === 121) {
      return res.status(400).json({ error: "ข้อมูลไม่ผ่านเงื่อนไขของระบบ (validator)" });
    }
    return res.status(500).json({ error: e?.message || "Register failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const username = s(req.body.username);
    const password = s(req.body.password);

    if (!username || !password) {
      return res.status(400).json({ error: "กรุณากรอก username/password" });
    }

    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: "ไม่พบผู้ใช้" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(400).json({ error: "รหัสผ่านไม่ถูกต้อง" });

    if (user.role === "user" && !user.is_active) {
      return res.status(403).json({ error: "บัญชียังไม่ได้รับอนุมัติจาก Admin" });
    }

    user.last_login = new Date();
    await user.save();

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: "JWT_SECRET missing in .env" });
    }

    const token = jwt.sign({ user_id: user._id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        farm_id: user.farm_id,
      },
    });
  } catch (e) {
    console.error("LOGIN ERROR:", e);
    res.status(500).json({ error: e?.message || "Login failed" });
  }
});

/**
 * ✅ GET /api/auth/me
 * ดึงข้อมูลผู้ใช้ที่ login อยู่ (จาก token)
 */
router.get("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.user?._id;
    const user = await User.findById(userId)
      .select("_id username email phone role farm_id is_active created_at")
      .populate("farm_id", "farm_name");

    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

/**
 * ✅ PUT /api/auth/me
 * แก้ไขข้อมูลผู้ใช้ (email/phone)
 */
router.put("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.user?._id;
    const { username, email, phone } = req.body || {};

    const updates = {};
    if (username !== undefined) updates.username = String(username).trim();
    if (email !== undefined) updates.email = String(email).trim();
    if (phone !== undefined) updates.phone = String(phone).trim();

    if (updates.username !== undefined && !updates.username) {
      return res.status(400).json({ error: "username is required" });
    }
    if (updates.email && !updates.email.includes("@")) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    if (updates.username || updates.email) {
      const dup = await User.findOne({
        _id: { $ne: userId },
        $or: [
          updates.username ? { username: updates.username } : null,
          updates.email ? { email: updates.email } : null,
        ].filter(Boolean),
      }).lean();

      if (dup) {
        return res.status(400).json({ error: "username หรือ email ถูกใช้แล้ว" });
      }
    }

    const user = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true })
      .select("_id username email phone role farm_id is_active created_at")
      .populate("farm_id", "farm_name");

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ error: "Failed to update profile" });
  }
});

/**
 * ✅ PUT /api/auth/change-password
 * เปลี่ยนรหัสผ่าน (ต้องใส่ oldPassword + newPassword)
 */
router.put("/change-password", requireAuth, async (req, res) => {
  try {
    const userId = req.user?._id;
    const { oldPassword, newPassword } = req.body || {};

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "oldPassword and newPassword are required" });
    }
    if (String(newPassword).trim().length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }

    const user = await User.findById(userId).select("_id password_hash");
    if (!user) return res.status(404).json({ error: "User not found" });

    const ok = await bcrypt.compare(String(oldPassword), user.password_hash);
    if (!ok) return res.status(400).json({ error: "Old password is incorrect" });

    user.password_hash = await bcrypt.hash(String(newPassword), 10);
    await user.save();

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to change password" });
  }
});

export default router;
