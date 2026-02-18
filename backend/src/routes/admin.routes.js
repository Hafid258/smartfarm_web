import express from "express";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import User from "../models/User.js";
import Farm from "../models/Farm.js";
import NotificationSetting from "../models/NotificationSetting.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

// ✅ Admin only
router.use(requireAuth, requireAdmin);

// -------------------------
// Helpers
// -------------------------
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const pickFarmIdOrNull = (farm_id) => {
  if (!farm_id) return null;
  if (typeof farm_id !== "string") return farm_id;
  if (farm_id === "null" || farm_id === "undefined" || farm_id.trim() === "") return null;
  if (!isValidObjectId(farm_id)) return null;
  return new mongoose.Types.ObjectId(farm_id);
};

const sanitizeString = (s) => (typeof s === "string" ? s.trim() : "");
const isValidDiscordWebhook = (url) =>
  !url || String(url).startsWith("https://discord.com/api/webhooks/");

// -------------------------
// ✅ GET /api/admin/farms
// list farms for admin dropdown
// -------------------------
router.get("/farms", async (_req, res) => {
  try {
    const farms = await Farm.find()
      .select("_id farm_name createdAt")
      .sort({ createdAt: -1 })
      .lean();

    res.json(farms);
  } catch (e) {
    console.error("ADMIN GET FARMS ERROR:", e);
    res.status(500).json({ error: "Failed to load farms" });
  }
});

// -------------------------
// ✅ GET /api/admin/farms/:id/discord-webhook
// read discord webhook from notification_settings by farm users
// -------------------------
router.get("/farms/:id/discord-webhook", async (req, res) => {
  try {
    const farmId = req.params.id;
    if (!isValidObjectId(farmId)) return res.status(400).json({ error: "invalid farm id" });

    const users = await User.find({ farm_id: new mongoose.Types.ObjectId(farmId) })
      .select("_id username")
      .lean();

    if (!users.length) {
      return res.json({
        discord_webhook_url: "",
        discord_enabled: false,
        user_count: 0,
        configured_users: 0,
      });
    }

    const userIds = users.map((u) => u._id);
    const settings = await NotificationSetting.find({ user_id: { $in: userIds } })
      .select("user_id discord_webhook_url discord_enabled")
      .lean();

    const preferred =
      settings.find((s) => sanitizeString(s.discord_webhook_url)) ||
      settings[0] ||
      null;

    const configuredUsers = settings.filter((s) => sanitizeString(s.discord_webhook_url)).length;

    return res.json({
      discord_webhook_url: sanitizeString(preferred?.discord_webhook_url),
      discord_enabled: Boolean(preferred?.discord_enabled),
      user_count: users.length,
      configured_users: configuredUsers,
    });
  } catch (e) {
    console.error("ADMIN GET FARM DISCORD WEBHOOK ERROR:", e);
    return res.status(500).json({ error: "Failed to load discord webhook" });
  }
});

// -------------------------
// ✅ POST /api/admin/farms/:id/discord-webhook
// update discord webhook into notification_settings for all users in farm
// -------------------------
router.post("/farms/:id/discord-webhook", async (req, res) => {
  try {
    const farmId = req.params.id;
    if (!isValidObjectId(farmId)) return res.status(400).json({ error: "invalid farm id" });

    const discord_webhook_url = sanitizeString(req.body.discord_webhook_url || "");
    if (!isValidDiscordWebhook(discord_webhook_url)) {
      return res.status(400).json({ error: "Discord Webhook URL ไม่ถูกต้อง" });
    }

    const users = await User.find({ farm_id: new mongoose.Types.ObjectId(farmId) })
      .select("_id")
      .lean();
    if (!users.length) {
      return res.status(400).json({ error: "ไม่พบผู้ใช้ในฟาร์มนี้" });
    }

    const discord_enabled =
      req.body.discord_enabled !== undefined
        ? Boolean(req.body.discord_enabled)
        : Boolean(discord_webhook_url);

    const now = new Date();
    const ops = users.map((u) => ({
      updateOne: {
        filter: { user_id: u._id },
        update: {
          $set: {
            notify_channel: "discord",
            discord_webhook_url,
            discord_enabled,
            updated_at: now,
          },
        },
        upsert: true,
      },
    }));

    await NotificationSetting.bulkWrite(ops);

    return res.json({
      ok: true,
      updated_users: users.length,
      discord_webhook_url,
      discord_enabled,
    });
  } catch (e) {
    console.error("ADMIN SET FARM DISCORD WEBHOOK ERROR:", e);
    return res.status(500).json({ error: "Failed to save discord webhook" });
  }
});

// -------------------------
// ✅ GET /api/admin/users
// list users (supports search + paging)
// query:
//  - q=keyword (username/email/phone/role)
//  - page=1
//  - limit=50 (max 200)
// -------------------------
router.get("/users", async (req, res) => {
  try {
    const q = sanitizeString(req.query.q || "");
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "100", 10), 1), 200);
    const skip = (page - 1) * limit;

    const filter = {};
    if (q) {
      filter.$or = [
        { username: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
        { phone: { $regex: q, $options: "i" } },
        { role: { $regex: q, $options: "i" } },
      ];
    }

    const [items, total] = await Promise.all([
      User.find(filter)
        .populate("farm_id", "farm_name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    });
  } catch (e) {
    console.error("ADMIN GET USERS ERROR:", e);
    res.status(500).json({ error: "Failed to load users" });
  }
});

// -------------------------
// ✅ POST /api/admin/users
// create user (admin creates)
// body:
//  - username (required)
//  - email (required)
//  - phone
//  - role (user/admin)
//  - farm_id (ObjectId or null)
//  - password (optional; default 123456)
//  - is_active (default true)
// -------------------------
router.post("/users", async (req, res) => {
  try {
    const username = sanitizeString(req.body.username);
    const email = sanitizeString(req.body.email);
    const phone = sanitizeString(req.body.phone);
    const role = sanitizeString(req.body.role) || "user";
    const is_active = req.body.is_active ?? true;

    if (!username) return res.status(400).json({ error: "username is required" });
    if (!email) return res.status(400).json({ error: "email is required" });
    if (!["user", "admin"].includes(role)) return res.status(400).json({ error: "invalid role" });

    // ✅ Prevent duplicate
    const exist = await User.findOne({
      $or: [{ username }, { email }],
    }).lean();

    if (exist) {
      return res.status(400).json({ error: "username หรือ email ถูกใช้แล้ว" });
    }

    const farm_id = pickFarmIdOrNull(req.body.farm_id);

    // ✅ password hashing
    const rawPassword = sanitizeString(req.body.password) || "123456";
    const password_hash = await bcrypt.hash(rawPassword, 10);

    const user = await User.create({
      username,
      email,
      phone,
      role,
      farm_id,
      password_hash,
      is_active,
    });

    const created = await User.findById(user._id)
      .populate("farm_id", "farm_name")
      .lean();

    res.json({ ok: true, user: created });
  } catch (e) {
    console.error("ADMIN CREATE USER ERROR:", e);
    res.status(500).json({ error: e?.message || "Failed to create user" });
  }
});

// -------------------------
// ✅ PUT /api/admin/users/:id
// update user
// body can include:
//  - username/email/phone/role/is_active/farm_id
//  - password (optional reset)
// -------------------------
router.put("/users/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) return res.status(400).json({ error: "invalid user id" });

    const payload = {};

    if (req.body.username !== undefined) payload.username = sanitizeString(req.body.username);
    if (req.body.email !== undefined) payload.email = sanitizeString(req.body.email);
    if (req.body.phone !== undefined) payload.phone = sanitizeString(req.body.phone);

    if (req.body.role !== undefined) {
      const role = sanitizeString(req.body.role);
      if (!["user", "admin"].includes(role)) return res.status(400).json({ error: "invalid role" });
      payload.role = role;
    }

    if (req.body.is_active !== undefined) {
      payload.is_active = Boolean(req.body.is_active);
    }

    if (req.body.farm_id !== undefined) {
      payload.farm_id = pickFarmIdOrNull(req.body.farm_id);
    }

    // ✅ reset password if provided
    if (req.body.password && sanitizeString(req.body.password).length >= 6) {
      payload.password_hash = await bcrypt.hash(sanitizeString(req.body.password), 10);
    }

    // ✅ Prevent duplicate username/email when changing
    if (payload.username || payload.email) {
      const dup = await User.findOne({
        _id: { $ne: id },
        $or: [
          payload.username ? { username: payload.username } : null,
          payload.email ? { email: payload.email } : null,
        ].filter(Boolean),
      }).lean();

      if (dup) {
        return res.status(400).json({ error: "username หรือ email ถูกใช้แล้ว" });
      }
    }

    const updated = await User.findByIdAndUpdate(id, payload, { new: true })
      .populate("farm_id", "farm_name")
      .lean();

    if (!updated) return res.status(404).json({ error: "User not found" });

    res.json({ ok: true, user: updated });
  } catch (e) {
    console.error("ADMIN UPDATE USER ERROR:", e);
    res.status(500).json({ error: e?.message || "Failed to update user" });
  }
});

// -------------------------
// ✅ DELETE /api/admin/users/:id
// delete user
// -------------------------
router.delete("/users/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) return res.status(400).json({ error: "invalid user id" });

    const deleted = await User.findByIdAndDelete(id).lean();
    if (!deleted) return res.status(404).json({ error: "User not found" });

    res.json({ ok: true });
  } catch (e) {
    console.error("ADMIN DELETE USER ERROR:", e);
    res.status(500).json({ error: e?.message || "Failed to delete user" });
  }
});

export default router;
