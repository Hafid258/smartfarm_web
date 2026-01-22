import express from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import NotificationSetting from "../models/NotificationSetting.js";
import User from "../models/User.js";

const router = express.Router();

// ✅ helper: ส่ง discord message
async function sendDiscord(url, content) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Discord send failed: ${text || resp.status}`);
  }
}

/**
 * ✅ POST /api/discord/test
 * ส่ง test ไป webhook ของ user ที่ login
 */
router.post("/test", requireAuth, async (req, res) => {
  try {
    const userId = req.user?._id;

    // ✅ DEBUG: แสดง DB ที่เชื่อมจริง + userId
    console.log("DISCORD TEST DEBUG => db:", mongoose.connection.name);
    console.log("DISCORD TEST DEBUG => userId:", String(userId));
    console.log("DISCORD TEST DEBUG => username:", req.user?.username);

    // ✅ 1) ลองหาแบบ mongoose model ก่อน
    let setting = await NotificationSetting.findOne({ user_id: userId }).lean();
    console.log("DISCORD TEST DEBUG => model setting:", setting ? "FOUND" : "NULL");

    // ✅ 2) ถ้าไม่เจอ ลองหาแบบ raw collection ตรง ๆ (กัน model ชี้ผิด)
    if (!setting) {
      const raw = await mongoose.connection
        .collection("notification_settings")
        .findOne({ user_id: userId });

      console.log("DISCORD TEST DEBUG => raw collection setting:", raw ? "FOUND" : "NULL");
      setting = raw || null;
    }

    if (!setting) {
      return res.status(400).json({
        error: "ยังไม่ได้ตั้งค่า Discord Webhook",
        debug: {
          db: mongoose.connection.name,
          userId: String(userId),
          username: req.user?.username,
          hint: "ตรวจว่า notification_settings มี user_id ตรงกับ userId นี้ใน DB เดียวกันหรือไม่",
        },
      });
    }

    if (!setting.discord_enabled) {
      return res.status(400).json({ error: "Discord ถูกปิดใช้งาน (discord_enabled=false)" });
    }

    const url = String(setting.discord_webhook_url || "").trim();
    if (!url.startsWith("https://discord.com/api/webhooks/")) {
      return res.status(400).json({ error: "Discord Webhook URL ไม่ถูกต้อง" });
    }

    const message =
      String(req.body?.message || "").trim() ||
      `✅ SmartFarm Discord Test Message (by ${req.user?.username || "user"})`;

    await sendDiscord(url, message);

    return res.json({ ok: true });
  } catch (err) {
    console.error("DISCORD TEST ERROR:", err);
    return res.status(500).json({ error: "Failed to send discord message", detail: err.message });
  }
});

/**
 * ✅ POST /api/discord/test-user
 * Admin เลือก user เพื่อทดสอบส่งได้
 */
router.post("/test-user", requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin only" });

    const targetUserId = String(req.body?.user_id || "").trim();
    if (!targetUserId) return res.status(400).json({ error: "user_id is required" });

    const targetUser = await User.findById(targetUserId).select("_id username role").lean();
    if (!targetUser) return res.status(404).json({ error: "Target user not found" });

    // ✅ DEBUG
    console.log("DISCORD TEST-USER DEBUG => db:", mongoose.connection.name);
    console.log("DISCORD TEST-USER DEBUG => targetUserId:", targetUserId);

    let setting = await NotificationSetting.findOne({ user_id: targetUserId }).lean();

    if (!setting) {
      const raw = await mongoose.connection
        .collection("notification_settings")
        .findOne({ user_id: new mongoose.Types.ObjectId(targetUserId) });

      setting = raw || null;
    }

    if (!setting) {
      return res.status(400).json({
        error: `User '${targetUser.username}' ยังไม่ได้ตั้งค่า Discord Webhook`,
      });
    }

    if (!setting.discord_enabled) {
      return res.status(400).json({
        error: `Discord ของ User '${targetUser.username}' ถูกปิดใช้งาน`,
      });
    }

    const url = String(setting.discord_webhook_url || "").trim();
    if (!url.startsWith("https://discord.com/api/webhooks/")) {
      return res.status(400).json({ error: "Discord Webhook URL ของ user ไม่ถูกต้อง" });
    }

    const message =
      String(req.body?.message || "").trim() ||
      `✅ SmartFarm Discord Test Message (sent by Admin: ${req.user?.username || "admin"})`;

    await sendDiscord(url, message);

    return res.json({ ok: true, target: targetUser.username });
  } catch (err) {
    console.error("DISCORD TEST-USER ERROR:", err);
    return res.status(500).json({ error: "Failed to send discord message", detail: err.message });
  }
});

export default router;
