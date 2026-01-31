import express from "express";
import { runScheduleTick } from "../scheduler.js";

const router = express.Router();

function requireCronAuth(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return next();

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== secret) return res.status(401).json({ error: "Unauthorized" });
  return next();
}

router.post("/schedule", requireCronAuth, async (_req, res) => {
  try {
    await runScheduleTick();
    res.json({ ok: true });
  } catch (err) {
    console.error("CRON schedule error:", err?.message || err);
    res.status(500).json({ error: "Cron failed" });
  }
});

export default router;
