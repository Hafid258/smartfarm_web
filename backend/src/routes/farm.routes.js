import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import Farm from "../models/Farm.js";

const router = express.Router();


// ✅ list farms:
// admin => all
// user  => only own farm
router.get("/", requireAuth, async (req, res) => {
  try {
    if (req.user.role === "admin") {
      const farms = await Farm.find().sort({ createdAt: -1 });
      return res.json(farms);
    }

    // user: only own farm
    const farm = await Farm.findById(req.user.farm_id);
    return res.json(farm ? [farm] : []);
  } catch (err) {
    res.status(500).json({ error: "Failed to load farms" });
  }
});

// ✅ create farm (admin only)
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { farm_name } = req.body;
    if (!farm_name) return res.status(400).json({ error: "farm_name required" });

    const farm = await Farm.create({ farm_name });
    res.json(farm);
  } catch (err) {
    res.status(500).json({ error: "Failed to create farm" });
  }
});

// ✅ update farm (admin only)
router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const farm = await Farm.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!farm) return res.status(404).json({ error: "Farm not found" });
    res.json(farm);
  } catch (err) {
    res.status(500).json({ error: "Failed to update farm" });
  }
});

// ✅ delete farm (admin only)
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const farm = await Farm.findByIdAndDelete(req.params.id);
    if (!farm) return res.status(404).json({ error: "Farm not found" });
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete farm" });
  }
});

export default router;
