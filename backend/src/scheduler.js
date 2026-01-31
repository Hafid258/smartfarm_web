import FarmSetting from "./models/FarmSetting.js";
import DeviceCommand from "./models/DeviceCommand.js";

function getBangkokParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = fmt.formatToParts(d);
  const obj = {};
  for (const p of parts) obj[p.type] = p.value;

  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    dateStr: `${obj.year}-${obj.month}-${obj.day}`, // YYYY-MM-DD
    hhmm: `${obj.hour}:${obj.minute}`, // HH:mm
    dow: weekdayMap[obj.weekday] ?? 0, // 0..6
  };
}

export async function runScheduleTick() {
  const { dateStr, hhmm, dow } = getBangkokParts(new Date());

  const settingsList = await FarmSetting.find({
    watering_schedules: { $exists: true, $ne: [] },
  }).lean();

  for (const s of settingsList) {
    const farm_id = s.farm_id;
    if (s.pump_paused) continue;

    for (const sch of s.watering_schedules || []) {
      if (!sch?.enabled) continue;

      const days = Array.isArray(sch.days) ? sch.days : [];
      if (days.length > 0 && !days.includes(dow)) continue;

      if (String(sch.time) !== hhmm) continue;

      const scheduled_key = `${String(farm_id)}|${dateStr}|${hhmm}`;

      const exists = await DeviceCommand.findOne({
        farm_id,
        scheduled_key,
        command: "ON",
      }).lean();

      if (exists) continue;

      const duration_sec = Math.min(3600, Math.max(1, Number(sch.duration_sec || 30)));

      await DeviceCommand.create({
        farm_id,
        device_id: "pump",
        command: "ON",
        duration_sec,
        status: "pending",
        source: "auto",
        timestamp: new Date(),
        scheduled_key,
      });
    }
  }
}
