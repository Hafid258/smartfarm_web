// backend/src/server.js (local runtime only)
import dotenv from "dotenv";
import app from "./app.js";
import { connectDb } from "./db.js";
import { runScheduleTick } from "./scheduler.js";

dotenv.config();

async function start() {
  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!MONGO_URI) {
    console.error("Missing MONGO_URI in .env");
    process.exit(1);
  }

  await connectDb(MONGO_URI);
  console.log("Mongo connected");

  if (process.env.SCHEDULER_ENABLED === "true") {
    setInterval(() => {
      runScheduleTick().catch((err) => {
        console.error("Scheduler tick error:", err?.message || err);
      });
    }, 30 * 1000);
  }

  const port = process.env.PORT || 3000;
  app.listen(port, "0.0.0.0", () => console.log(`API running on :${port}`));
}

start().catch((e) => {
  console.error("Startup error:", e);
  process.exit(1);
});
