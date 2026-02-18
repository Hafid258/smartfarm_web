import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../../services/api.js";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Spinner from "../../components/ui/Spinner.jsx";
import { useToast } from "../../components/ui/ToastProvider.jsx";

import SummaryCard from "../../components/SummaryCard.jsx";
import LineChartCard from "../../components/LineChartCard.jsx";
import Modal from "../../components/ui/Modal.jsx";

// ✅ Excel Export
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

function fmt(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "-";
  return Number(n).toFixed(digits);
}

function getSetting(settings, keyNew, keyOld) {
  if (!settings) return undefined;
  if (settings[keyNew] !== undefined) return settings[keyNew];
  if (keyOld && settings[keyOld] !== undefined) return settings[keyOld];
  return undefined;
}

function safeSheetName(name) {
  const cleaned = String(name || "")
    .replace(/[\\/?*\[\]:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Farm";
  return cleaned.length > 31 ? cleaned.slice(0, 31) : cleaned;
}

/* ===========================
   ✅ Date Helpers
   =========================== */
function isSameDay(ts, dateStr) {
  if (!dateStr) return true;
  if (!ts) return false;

  const d = new Date(ts);
  const [y, m, day] = dateStr.split("-").map(Number);

  return (
    d.getFullYear() === y &&
    d.getMonth() + 1 === m &&
    d.getDate() === day
  );
}

function todayStr() {
  const t = new Date();
  const yyyy = t.getFullYear();
  const mm = String(t.getMonth() + 1).padStart(2, "0");
  const dd = String(t.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function filterByMonth(items, getTs, monthStr) {
  if (!monthStr) return items;
  const [y, m] = monthStr.split("-").map(Number);
  if (!y || !m) return items;
  return items.filter((x) => {
    const ts = getTs(x);
    if (!ts) return false;
    const d = new Date(ts);
    return d.getFullYear() === y && d.getMonth() + 1 === m;
  });
}

function monthRange(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  if (!y || !m) return null;
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/* ===========================
   ✅ Status helpers (สีสถานะ)
   =========================== */
function statusTemp(temp) {
  if (temp === null || temp === undefined) return "normal";
  const t = Number(temp);
  if (t > 35) return "danger";
  if (t >= 32) return "warning";
  return "good";
}

function statusSoil(soil) {
  if (soil === null || soil === undefined) return "normal";
  const s = Number(soil);
  if (s < 30) return "danger";
  if (s < 40) return "warning";
  return "good";
}

function lightLuxFromPercent(percent, maxLux = 20000) {
  if (percent === null || percent === undefined) return null;
  const v = Number(percent);
  if (Number.isNaN(v)) return null;
  const lux = (v / 100) * maxLux;
  return Math.max(0, lux);
}

function lightLuxValue(row) {
  if (!row) return null;
  if (row.light_lux !== null && row.light_lux !== undefined) return Number(row.light_lux);
  return lightLuxFromPercent(row.light_percent);
}

function statusLightLux(lightLux) {
  if (lightLux === null || lightLux === undefined) return "normal";
  const v = Number(lightLux);
  if (Number.isNaN(v)) return "normal";
  if (v < 2000) return "danger";
  if (v < 4000) return "warning";
  return "good";
}

function statusRH(rh) {
  if (rh === null || rh === undefined) return "normal";
  const r = Number(rh);
  if (r > 90) return "warning";
  if (r < 40) return "warning";
  return "good";
}

function statusVPD(vpd) {
  if (vpd === null || vpd === undefined) return "normal";
  const v = Number(vpd);
  if (v < 0.4 || v > 1.5) return "danger";
  if ((v >= 0.4 && v < 0.8) || (v > 1.2 && v <= 1.5)) return "warning";
  return "good";
}

function statusDewPoint(temp, dew) {
  if (temp === null || temp === undefined) return "normal";
  if (dew === null || dew === undefined) return "normal";
  const diff = Number(temp) - Number(dew);
  if (diff <= 2) return "warning";
  return "good";
}

function statusSoilDryingRate(rate) {
  if (rate === null || rate === undefined) return "normal";
  const r = Number(rate);
  if (r > 0.3) return "danger";
  if (r > 0.15) return "warning";
  return "good";
}

function statusGDD(gdd) {
  if (gdd === null || gdd === undefined) return "normal";
  const g = Number(gdd);
  if (g > 15) return "warning";
  return "good";
}

/* ===========================
   ✅ Popup อธิบายค่า
   =========================== */
const METRIC_INFO = {
  temperature: {
    title: "อุณหภูมิ (Temperature)",
    unit: "°C",
    desc: `
อุณหภูมิอากาศมีผลต่อการเจริญเติบโตและการคายน้ำของพืช

• ดี: 18–32°C  
• ควรระวัง: 32–35°C  
• อันตราย: > 35°C  
`,
  },
  humidity_air: {
    title: "ความชื้นอากาศ (Humidity Air)",
    unit: "%",
    desc: `
ความชื้นในอากาศสูงมากทำให้เชื้อราเกิดได้ง่าย  
ความชื้นต่ำมากทำให้พืชคายน้ำเร็ว

• ดี: 40–90%  
• ควรระวัง: <40% หรือ >90%  
`,
  },
  soil_moisture: {
    title: "ความชื้นดิน (Soil Moisture)",
    unit: "%",
    desc: `
ค่าความชื้นในดิน (0–100%) บอกว่าดินแห้งหรือชื้นมากแค่ไหน

• ดี: >40%  
• ควรระวัง: 30–40%  
• อันตราย: <30%  
`,
  },
  light_lux: {
    title: "แสง (Lux)",
    unit: "lux",
    desc: `
ค่าความเข้มแสงจาก BH1750 (หน่วย lux)

• ค่าน้อยมาก (<2,000 lux) หมายถึงแสงน้อย
• ค่ากลาง (2,000–4,000 lux) แสงปานกลาง
• ค่าสูง (>4,000 lux) แสงมาก
`,
  },

  vpd: {
    title: "VPD (Vapor Pressure Deficit)",
    unit: "kPa",
    desc: `
VPD บอกว่าอากาศแห้ง/ชื้นแค่ไหน และกระทบการคายน้ำของพืช

• ดี: 0.8–1.2 kPa  
• ควรระวัง: 0.4–0.8 หรือ 1.2–1.5  
• อันตราย: <0.4 หรือ >1.5  
`,
  },
  gdd: {
    title: "GDD (Growing Degree Days)",
    unit: "°C",
    desc: `
ดัชนีสะสมความร้อน ใช้ประเมินความเร็วการเจริญเติบโตของพืช  
ยิ่งสะสมมาก → พืชโตเร็ว

• ปกติ: 0–15  
• ควรระวัง: >15 (อุณหภูมิสะสมสูงมาก)  
`,
  },
  dew_point: {
    title: "จุดน้ำค้าง (Dew Point)",
    unit: "°C",
    desc: `
อุณหภูมิที่เริ่มเกิดน้ำค้าง  
ถ้า Dew Point ใกล้ Temp มาก (<2°C) → เสี่ยงเชื้อราและโรคพืช

• ดี: ต่างมากกว่า 2°C  
• ควรระวัง: ต่าง ≤ 2°C  
`,
  },
  soil_drying_rate: {
    title: "อัตราการแห้งของดิน (Soil Drying Rate)",
    unit: "%/min",
    desc: `
อัตราที่ความชื้นดินลดลงต่อเวลา  
ยิ่งสูง → ดินแห้งเร็ว (แดดแรง, ลมแรง, ระบบน้ำไม่พอ)

• ดี: ≤ 0.15 %/min  
• ควรระวัง: 0.15–0.30  
• อันตราย: > 0.30  
`,
  },
};

/* ===========================
   ✅ รายการกราฟทั้งหมด
   =========================== */
const CHARTS = [
  { id: "temperature", label: "อุณหภูมิอากาศ (°C)", type: "sensor", dataKey: "temperature", unit: "°C" },
  { id: "humidity_air", label: "ความชื้นอากาศ (%)", type: "sensor", dataKey: "humidity_air", unit: "%" },
  { id: "soil_moisture", label: "ความชื้นดิน (%)", type: "sensor", dataKey: "soil_moisture", unit: "%" },
  { id: "light_lux", label: "แสงที่พืชได้รับ (lux)", type: "sensor", dataKey: "light_lux", unit: "lux" },

  { id: "vpd", label: "ความแห้งของอากาศ (VPD, kPa)", type: "index", dataKey: "vpd", unit: "kPa" },
  { id: "gdd", label: "ความร้อนสะสม (GDD, °C)", type: "index", dataKey: "gdd", unit: "°C" },
  { id: "dew_point", label: "จุดน้ำค้าง (°C)", type: "index", dataKey: "dew_point", unit: "°C" },
  { id: "soil_drying_rate", label: "ความเร็วที่ดินแห้ง (%/นาที)", type: "index", dataKey: "soil_drying_rate", unit: "%/min" },
];

const WEEKDAY_LABEL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสฯ", "ศุกร์", "เสาร์"];

function normalizeSchedules(settings) {
  if (!settings) return [];
  if (Array.isArray(settings.watering_schedules) && settings.watering_schedules.length) {
    return settings.watering_schedules.map((s) => ({
      enabled: Boolean(s.enabled),
      time: s.time || "06:00",
      days: Array.isArray(s.days) ? s.days : [],
    }));
  }
  if (settings.watering_schedule_time || settings.watering_schedule_days?.length) {
    return [
      {
        enabled: Boolean(settings.watering_schedule_enabled),
        time: settings.watering_schedule_time || "06:00",
        days: Array.isArray(settings.watering_schedule_days) ? settings.watering_schedule_days : [],
      },
    ];
  }
  return [];
}

export default function Dashboard() {
  const toast = useToast();

  const [farms, setFarms] = useState([]);
  const [farmId, setFarmId] = useState(localStorage.getItem("admin_farmId") || "");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");

  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);

  const [settings, setSettings] = useState(null);
  const [notifs, setNotifs] = useState([]);

  const [indexLatest, setIndexLatest] = useState(null);
  const [indexHistory, setIndexHistory] = useState([]);

  const [exportBusy, setExportBusy] = useState(false);
  const [exportAllBusy, setExportAllBusy] = useState(false);

  // ✅ Popup อธิบายค่า
  const [openMetric, setOpenMetric] = useState(null);

  // ✅ วันที่เลือก (เลือกจากวันที่มีข้อมูลเท่านั้น)
  const [selectedDate, setSelectedDate] = useState("");
  const [lockAllDates, setLockAllDates] = useState(false);

  // ✅ ปุ่ม/เมนู UI ใหม่
  const [openChartPicker, setOpenChartPicker] = useState(false);
  const [openExportMenu, setOpenExportMenu] = useState(false);
  const [openExportModal, setOpenExportModal] = useState(false);
  const [openNotifModal, setOpenNotifModal] = useState(false);
  const [exportMode, setExportMode] = useState("single"); // single | all
  const [exportMonth, setExportMonth] = useState(""); // YYYY-MM
  const [exportOptions, setExportOptions] = useState({
    sensor: true,
    index: true,
    settings: true,
    notifications: true,
  });
  const [exportMonths, setExportMonths] = useState([]);

  const exportMenuRef = useRef(null);

  // ✅ เลือกกราฟที่ต้องการแสดง
  const defaultVisibleCharts = ["temperature", "humidity_air", "soil_moisture", "vpd"];
  const [visibleCharts, setVisibleCharts] = useState(() => {
    try {
      const saved = localStorage.getItem("dashboard_visibleCharts");
      const parsed = saved ? JSON.parse(saved) : defaultVisibleCharts;
      return parsed.map((id) => (id === "light_percent" ? "light_lux" : id));
    } catch {
      return defaultVisibleCharts;
    }
  });

  useEffect(() => {
    localStorage.setItem("dashboard_visibleCharts", JSON.stringify(visibleCharts));
  }, [visibleCharts]);

  const toggleChart = (id) => {
    setVisibleCharts((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };
  const selectAllCharts = () => setVisibleCharts(CHARTS.map((c) => c.id));
  const clearCharts = () => setVisibleCharts([]);
  const resetCharts = () => setVisibleCharts(defaultVisibleCharts);

  const pickError = (e, fallback) =>
    e?.response?.data?.error || e?.message || fallback;

  // ✅ ปิด export menu เมื่อคลิกข้างนอก
  useEffect(() => {
    if (!openExportMenu) return;

    const onDown = (ev) => {
      const el = exportMenuRef.current;
      if (!el) return;
      if (!el.contains(ev.target)) setOpenExportMenu(false);
    };

    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [openExportMenu]);

  const loadFarms = useCallback(async () => {
    try {
      const res = await api.get("/farms");
      const list = Array.isArray(res.data) ? res.data : [];
      setFarms(list);

      if (!list.length) {
        setLoading(false);          
        setErr("ยังไม่มีฟาร์มในระบบ");
        return;
      }

      const hasCurrent = farmId && list.some((f) => String(f._id) === String(farmId));
      if (!hasCurrent) {
        const id = list[0]._id;
        setFarmId(id);
        localStorage.setItem("admin_farmId", id);
      }
    } catch (e) {
      console.warn("loadFarms error:", e);
    }
  }, [farmId]);

  const loadAll = useCallback(async (silent = false) => {
    if (!farmId) return;

    setErr("");
    try {
      if (!silent) setLoading(true); else setRefreshing(true);

      const bust = `_=${Date.now()}`;
      const qs = `farm_id=${encodeURIComponent(farmId)}&${bust}`;

      const [
        latestRes,
        historyRes,
        settingsRes,
        notifRes,
        idxLatestRes,
        idxHistoryRes,
      ] = await Promise.all([
        api.get(`/sensor/latest?${qs}`),
        api.get(`/sensor/history?${qs}&limit=5000`),
        api.get(`/settings/my?${qs}`),
        api.get(`/notifications?${qs}&limit=10`),
        api.get(`/dashboard/index-latest?${qs}`),
        api.get(`/dashboard/index-history?${qs}&limit=5000`),
      ]);

      setLatest(latestRes.data || null);
      setHistory(Array.isArray(historyRes.data) ? historyRes.data : []);

      setSettings(settingsRes.data || null);
      setNotifs(Array.isArray(notifRes.data) ? notifRes.data : []);

      setIndexLatest(idxLatestRes.data || null);
      setIndexHistory(Array.isArray(idxHistoryRes.data) ? idxHistoryRes.data : []);
    } catch (e) {
      setErr(pickError(e, "โหลดข้อมูลภาพรวมไม่สำเร็จ"));
    } finally {
      if (!silent) setLoading(false); else setRefreshing(false);
    }
  }, [farmId]);

  const loadExportMonths = useCallback(async () => {
    if (!farmId) return;
    try {
      const res = await api.get(
        `/dashboard/available-months?farm_id=${encodeURIComponent(farmId)}&_=${Date.now()}`
      );
      const months = Array.isArray(res.data?.months) ? res.data.months : [];
      setExportMonths(months);
    } catch (e) {
      console.warn("loadExportMonths error:", e);
    }
  }, [farmId]);

  useEffect(() => {
    loadFarms();
  }, [loadFarms]);

  useEffect(() => {
    if (!farmId) return;
    localStorage.setItem("admin_farmId", farmId);

    loadAll();
    loadExportMonths();
    const t = setInterval(() => loadAll(true), 5000);
    return () => clearInterval(t);
  }, [farmId, loadAll, loadExportMonths]);

  /* ===========================
     ✅ วันที่ที่มีข้อมูลจริงใน DB
     =========================== */
  const availableDates = useMemo(() => {
    const set = new Set();

    history.forEach((x) => {
      if (!x?.timestamp) return;
      const d = new Date(x.timestamp);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      set.add(`${yyyy}-${mm}-${dd}`);
    });

    indexHistory.forEach((x) => {
      if (!x?.timestamp) return;
      const d = new Date(x.timestamp);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      set.add(`${yyyy}-${mm}-${dd}`);
    });

    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [history, indexHistory]);

  useEffect(() => {
    if (!exportMonth) return;
    if (!exportMonths.includes(exportMonth)) setExportMonth("");
  }, [exportMonths, exportMonth]);

  // ✅ ถ้าเลือกวันที่ไว้ แต่วันนั้นไม่มีแล้ว → reset
  useEffect(() => {
    if (!selectedDate) return;
    if (!availableDates.includes(selectedDate)) {
      setSelectedDate("");
      setLockAllDates(false);
    }
  }, [availableDates, selectedDate]);

  // ✅ ถ้ายังไม่เลือกวัน ให้ใช้วันล่าสุดอัตโนมัติ
  useEffect(() => {
    if (selectedDate) return;
    if (lockAllDates) return;
    if (!availableDates.length) return;
    setSelectedDate(availableDates[0]);
  }, [availableDates, selectedDate, lockAllDates]);

  /* ===========================
     ✅ Filter ตามวันที่เลือก
     =========================== */
  const filteredHistory = useMemo(() => {
    if (!selectedDate) return history;
    return history.filter((x) => isSameDay(x.timestamp, selectedDate));
  }, [history, selectedDate]);

  const filteredIndexHistory = useMemo(() => {
    if (!selectedDate) return indexHistory;
    return indexHistory.filter((x) => isSameDay(x.timestamp, selectedDate));
  }, [indexHistory, selectedDate]);

  const chartHistory = useMemo(() => {
    return filteredHistory.map((x) => ({
      ...x,
      light_lux: lightLuxValue(x),
    }));
  }, [filteredHistory]);

  // ✅ latest ของวันนั้น (เอาค่าล่าสุดของวัน)
  const latestShow = useMemo(() => {
    if (!selectedDate) return latest;
    if (!filteredHistory.length) return null;

    const sorted = [...filteredHistory].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return sorted[0];
  }, [selectedDate, latest, filteredHistory]);

  const indexLatestShow = useMemo(() => {
    if (!selectedDate) return indexLatest;
    if (!filteredIndexHistory.length) return null;

    const sorted = [...filteredIndexHistory].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return sorted[0];
  }, [selectedDate, indexLatest, filteredIndexHistory]);

  const schedules = useMemo(() => normalizeSchedules(settings), [settings]);

  /* ===========================
     ✅ Export Excel (ฟาร์มที่เลือก)
     =========================== */
  const exportExcel = useCallback(async (options) => {
    if (!farmId) {
      toast.error("กรุณาเลือกฟาร์มก่อนส่งออก");
      return;
    }

    try {
      setExportBusy(true);
      toast.info("กำลังส่งออก Excel...");

      const baseSensorHistory = selectedDate ? filteredHistory : history;
      const baseIndexHistory = selectedDate ? filteredIndexHistory : indexHistory;
      let exportSensorHistory = filterByMonth(baseSensorHistory, (x) => x.timestamp, exportMonth);
      let exportIndexHistory = filterByMonth(baseIndexHistory, (x) => x.timestamp, exportMonth);
      let exportNotifs = filterByMonth(notifs, (n) => n.created_at || n.timestamp, exportMonth);

      if (exportMonth) {
        const range = monthRange(exportMonth);
        if (range) {
          const [sensorRes, indexRes, notifRes] = await Promise.all([
            options.sensor
              ? api.get(`/sensor/history?start=${range.start}&end=${range.end}&limit=20000`)
              : null,
            options.index
              ? api.get(`/dashboard/index-history?start=${range.start}&end=${range.end}&limit=20000`)
              : null,
            options.notifications
              ? api.get(`/notifications?start=${range.start}&end=${range.end}&limit=20000`)
              : null,
          ]);

          if (sensorRes) {
            exportSensorHistory = Array.isArray(sensorRes.data) ? sensorRes.data : [];
          }
          if (indexRes) {
            exportIndexHistory = Array.isArray(indexRes.data) ? indexRes.data : [];
          }
          if (notifRes) {
            exportNotifs = Array.isArray(notifRes.data) ? notifRes.data : [];
          }
        }
      }

      const wb = XLSX.utils.book_new();

      if (options.sensor) {
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(
            exportSensorHistory.map((x) => ({
              timestamp: x.timestamp,
              temperature: x.temperature,
              humidity_air: x.humidity_air,
              soil_moisture: x.soil_moisture,
              soil_raw_adc: x.soil_raw_adc,
            }))
          ),
          "SensorHistory"
        );
      }

      if (options.index) {
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(
            exportIndexHistory.map((x) => ({
              timestamp: x.timestamp,
              vpd: x.vpd,
              gdd: x.gdd,
              dew_point: x.dew_point,
              soil_drying_rate: x.soil_drying_rate,
            }))
          ),
          "IndexHistory"
        );
      }

      if (options.settings) {
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(
            settings
              ? [
                  {
                    temp_threshold: getSetting(settings, "temp", "temp_threshold"),
                    rh_threshold: getSetting(settings, "rh", "rh_threshold"),
                    soil_threshold: getSetting(settings, "soil", "soil_threshold"),
                    sampling_interval_min: settings.sampling_interval_min,
                    watering_duration_sec: settings.watering_duration_sec,
                    watering_cooldown_min: settings.watering_cooldown_min,
                    watering_schedule_enabled: settings.watering_schedule_enabled,
                    watering_schedule_time: settings.watering_schedule_time,
                    watering_schedule_days: Array.isArray(settings.watering_schedule_days)
                      ? settings.watering_schedule_days.join(",")
                      : "",
                    watering_schedules: Array.isArray(settings.watering_schedules)
                      ? JSON.stringify(settings.watering_schedules)
                      : "",
                    updated_at: settings.updated_at,
                  },
                ]
              : []
          ),
          "ตั้งค่า"
        );
      }

      if (options.notifications) {
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(
            exportNotifs.map((n) => ({
              created_at: n.created_at || n.timestamp,
              alert_type: n.alert_type,
              severity: n.severity,
              details: n.details,
              is_read: n.is_read,
            }))
          ),
          "แจ้งเตือน"
        );
      }

      const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const file = new Blob([excelBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const farmName = farms.find((f) => f._id === farmId)?.farm_name || "farm";
      const suffix = exportMonth
        ? `_M${exportMonth}`
        : selectedDate
          ? `_${selectedDate}`
          : "";
      const filename = `SmartFarm_${farmName}_Dashboard${suffix}.xlsx`;

      saveAs(file, filename);
      toast.success("ส่งออกไฟล์ Excel สำเร็จ 🎉");
    } catch (e) {
      console.error("Export Excel error:", e);
      toast.error(pickError(e, "ส่งออกไฟล์ไม่สำเร็จ"));
    } finally {
      setExportBusy(false);
    }
  }, [
    farmId,
    farms,
    toast,
    selectedDate,
    exportMonth,
    filteredHistory,
    filteredIndexHistory,
    history,
    indexHistory,
    settings,
    notifs,
  ]);

  /* ===========================
     ✅ Export ทุกฟาร์ม (แยก sheet)
     =========================== */
  const exportAllFarmsExcel = useCallback(async (options) => {
    try {
      if (!farms.length) {
        toast.error("ไม่มีฟาร์มให้ส่งออก");
        return;
      }

      setExportAllBusy(true);
      toast.info("กำลังส่งออกข้อมูลทุกฟาร์ม (แยก sheet)...");

      const wb = XLSX.utils.book_new();

      for (const f of farms) {
        const fid = f._id;
        const farmNameRaw = f.farm_name || "farm";
        const farmName = safeSheetName(farmNameRaw);

        const bust = `_=${Date.now()}`;
        const qs = `farm_id=${encodeURIComponent(fid)}&${bust}`;

        const range = exportMonth ? monthRange(exportMonth) : null;
        const [historyRes, idxHistoryRes] = await Promise.all([
          api.get(
            `/sensor/history?${qs}&limit=20000${range ? `&start=${range.start}&end=${range.end}` : ""}`
          ),
          api.get(
            `/dashboard/index-history?${qs}&limit=20000${range ? `&start=${range.start}&end=${range.end}` : ""}`
          ),
        ]);

        let sensorHistory = Array.isArray(historyRes.data) ? historyRes.data : [];
        let idxHistory = Array.isArray(idxHistoryRes.data) ? idxHistoryRes.data : [];

        if (exportMonth) {
          sensorHistory = filterByMonth(sensorHistory, (x) => x.timestamp, exportMonth);
          idxHistory = filterByMonth(idxHistory, (x) => x.timestamp, exportMonth);
        }

        if (!exportMonth && selectedDate) {
          sensorHistory = sensorHistory.filter((x) => isSameDay(x.timestamp, selectedDate));
          idxHistory = idxHistory.filter((x) => isSameDay(x.timestamp, selectedDate));
        }

        if (options.sensor) {
          XLSX.utils.book_append_sheet(
            wb,
            XLSX.utils.json_to_sheet(
              sensorHistory.map((x) => ({
                farm_id: fid,
                farm_name: farmNameRaw,
                timestamp: x.timestamp,
                temperature: x.temperature,
                humidity_air: x.humidity_air,
                soil_moisture: x.soil_moisture,
                soil_raw_adc: x.soil_raw_adc,
              }))
            ),
            `${farmName}_SensorHistory`.slice(0, 31)
          );
        }

        if (options.index) {
          XLSX.utils.book_append_sheet(
            wb,
            XLSX.utils.json_to_sheet(
              idxHistory.map((x) => ({
                farm_id: fid,
                farm_name: farmNameRaw,
                timestamp: x.timestamp,
                vpd: x.vpd,
                gdd: x.gdd,
                dew_point: x.dew_point,
                soil_drying_rate: x.soil_drying_rate,
              }))
            ),
            `${farmName}_IndexHistory`.slice(0, 31)
          );
        }
      }

      const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const file = new Blob([excelBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const suffix = exportMonth
        ? `_M${exportMonth}`
        : selectedDate
          ? `_${selectedDate}`
          : "";
      const filename = `SmartFarm_AllFarms_Sheets${suffix}.xlsx`;
      saveAs(file, filename);

      toast.success("ส่งออกทุกฟาร์มสำเร็จ 🎉");
    } catch (e) {
      console.error("Export All Farms error:", e);
      toast.error(pickError(e, "ส่งออกข้อมูลทุกฟาร์มไม่สำเร็จ"));
    } finally {
      setExportAllBusy(false);
    }
  }, [farms, toast, selectedDate, exportMonth]);

  const confirmExport = async () => {
    const options = { ...exportOptions };
    if (exportMode === "all") {
      options.settings = false;
      options.notifications = false;
    }

    const hasAny = options.sensor || options.index || options.settings || options.notifications;
    if (!hasAny) {
      toast.error("กรุณาเลือกอย่างน้อย 1 หมวดข้อมูล");
      return;
    }

    setOpenExportModal(false);
    if (exportMode === "all") {
      await exportAllFarmsExcel(options);
    } else {
      await exportExcel(options);
    }
  };

  const metricModal = openMetric ? METRIC_INFO[openMetric] : null;

  return (
    <div className="space-y-6">
      {/* ✅ Popup อธิบายค่า */}
      <Modal
        open={!!openMetric}
        title={metricModal?.title || ""}
        onClose={() => setOpenMetric(null)}
      >
        {metricModal ? (
          <div className="space-y-3">
            <div className="text-sm text-gray-700 whitespace-pre-line">
              {metricModal.desc.trim()}
            </div>
            <div className="text-xs text-gray-500">หน่วย: {metricModal.unit}</div>
          </div>
        ) : null}
      </Modal>

      {/* ✅ Export Options */}
      <Modal
        open={openExportModal}
        title="เลือกข้อมูลที่จะส่งออก"
        onClose={() => setOpenExportModal(false)}
      >
        <div className="space-y-4">
          <div className="text-sm text-gray-600">
            {exportMode === "all"
              ? "ส่งออกทุกฟาร์ม (เลือกได้เฉพาะ Sensor/Index)"
              : "ส่งออกฟาร์มที่เลือก (เลือกหมวดข้อมูลได้)"}
          </div>

          <div>
            <div className="text-sm text-gray-600 mb-1">เลือกเดือน (เฉพาะเดือนที่มีข้อมูล)</div>
            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={exportMonth}
                onChange={(e) => setExportMonth(e.target.value)}
                className="border rounded-xl px-3 py-2 text-sm bg-white"
              >
                <option value="">ทุกเดือน</option>
                {exportMonths.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <Button variant="outline" onClick={() => setExportMonth("")}>
                ล้างเดือน
              </Button>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={exportOptions.sensor}
                onChange={(e) => setExportOptions((p) => ({ ...p, sensor: e.target.checked }))}
              />
              ประวัติค่าเซนเซอร์
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={exportOptions.index}
                onChange={(e) => setExportOptions((p) => ({ ...p, index: e.target.checked }))}
              />
              ค่าคำนวณ (Index)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={exportOptions.settings}
                onChange={(e) => setExportOptions((p) => ({ ...p, settings: e.target.checked }))}
                disabled={exportMode === "all"}
              />
              ค่าตั้งค่า
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={exportOptions.notifications}
                onChange={(e) => setExportOptions((p) => ({ ...p, notifications: e.target.checked }))}
                disabled={exportMode === "all"}
              />
              การแจ้งเตือน
            </label>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={confirmExport} disabled={exportBusy || exportAllBusy}>
              {exportMode === "all" ? "ส่งออกทุกฟาร์ม" : "ส่งออกฟาร์มนี้"}
            </Button>
            <Button variant="outline" onClick={() => setOpenExportModal(false)}>
              ยกเลิก
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={openNotifModal}
        title={`แจ้งเตือนล่าสุด (${notifs.length})`}
        onClose={() => setOpenNotifModal(false)}
      >
        {!notifs.length ? (
          <div className="text-sm text-gray-500">ยังไม่มีแจ้งเตือน</div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-auto pr-1">
            {notifs.map((n) => (
              <div key={n._id} className="rounded-2xl border p-4 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-gray-900">
                    {n.alert_type || "แจ้งเตือน"}
                  </div>
                  <Badge>{n.severity || "info"}</Badge>
                </div>
                <div className="text-sm text-gray-700">{n.details || "-"}</div>
                <div className="text-xs text-gray-500">
                  {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* ✅ Header + Actions + Filters (UI ใหม่) */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="text-2xl font-bold text-gray-900">ภาพรวมระบบฟาร์ม</div>
            <div className="text-sm text-gray-500">
              เลือกฟาร์มและวันที่เพื่อดูข้อมูลเฉพาะวัน เหมาะสำหรับติดตามแปลงผักบุ้ง
            </div>
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setOpenChartPicker((v) => !v)}
            >
              {openChartPicker ? "ปิดรายการกราฟ" : "เลือกกราฟที่อยากดู"}
            </Button>

            <Button
              variant="outline"
              onClick={() => setOpenNotifModal(true)}
              className="relative"
              title="แจ้งเตือนล่าสุด"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
                <path d="M9 17a3 3 0 0 0 6 0" />
              </svg>
              <span className="ml-2">แจ้งเตือน</span>
              {notifs.length > 0 ? (
                <span className="ml-2 min-w-6 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">
                  {notifs.length}
                </span>
              ) : null}
            </Button>

            {/* ✅ Export Excel (ปุ่มเดียว + เมนูย่อย) */}
            <div className="relative" ref={exportMenuRef}>
              <Button onClick={() => setOpenExportMenu((v) => !v)}>
                ส่งออก Excel
              </Button>

              {openExportMenu ? (
                <div className="absolute right-0 mt-2 w-72 bg-white border rounded-2xl shadow-lg z-50 overflow-hidden">
                  <button
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm disabled:opacity-50"
                    onClick={() => {
                      setOpenExportMenu(false);
                      setExportMode("single");
                      setOpenExportModal(true);
                    }}
                    disabled={loading || exportBusy}
                  >
                    📌 ส่งออกฟาร์มที่เลือก (Excel)
                    <div className="text-xs text-gray-500 mt-1">
                      รวมข้อมูลเซนเซอร์ + ค่าคำนวณ + ตั้งค่า + แจ้งเตือน
                      {selectedDate ? ` (เฉพาะวันที่ ${selectedDate})` : ""}
                    </div>
                  </button>

                  <div className="border-t" />

                  <button
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm disabled:opacity-50"
                    onClick={() => {
                      setOpenExportMenu(false);
                      setExportMode("all");
                      setOpenExportModal(true);
                    }}
                    disabled={loading || exportAllBusy || !farms.length}
                  >
                    🗂️ ส่งออกทุกฟาร์ม (แยกชีต)
                    <div className="text-xs text-gray-500 mt-1">
                      แยกเป็นประวัติเซนเซอร์/ค่าคำนวณของแต่ละฟาร์ม
                      {selectedDate ? ` (เฉพาะวันที่ ${selectedDate})` : ""}
                    </div>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* ✅ Filter Bar */}
        <Card className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={farmId}
                onChange={(e) => setFarmId(e.target.value)}
                className="border rounded-xl px-3 py-2 text-sm bg-white"
              >
                {farms.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.farm_name}
                  </option>
                ))}
              </select>

              <select
                value={selectedDate}
                onChange={(e) => {
                  const next = e.target.value;
                  setSelectedDate(next);
                  setLockAllDates(next === "");
                }}
                className="border rounded-xl px-3 py-2 text-sm bg-white"
                title="เลือกวันที่ที่มีข้อมูลในฐานข้อมูล"
              >
                <option value="">แสดงทั้งหมด</option>
                {availableDates.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              <Button
                variant="outline"
                onClick={() => {
                  const t = todayStr();
                  if (availableDates.includes(t)) {
                    setSelectedDate(t);
                    setLockAllDates(false);
                  } else if (availableDates.length) {
                    setSelectedDate(availableDates[0]);
                    setLockAllDates(false);
                  } else {
                    setSelectedDate("");
                    setLockAllDates(true);
                  }
                }}
              >
                วันนี้
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  setSelectedDate("");
                  setLockAllDates(true);
                }}
              >
                ล้าง
              </Button>
            </div>

            <div className="flex gap-2 justify-end items-center">
              <Button variant="outline" onClick={loadAll} disabled={loading}>
                รีเฟรช
              </Button>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Spinner /> กำลังโหลด...
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-3 text-sm text-gray-700">
            {selectedDate ? (
              <>
                📅 กำลังแสดงข้อมูลของวันที่ <b>{selectedDate}</b>
              </>
            ) : (
              <>📅 กำลังแสดงข้อมูลแบบรวม</>
            )}
          </div>
        </Card>
      </div>

      {/* Error */}
      {err && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl">
          {err}
        </div>
      )}

      {/* Main */}
      {loading ? (
        <div className="flex items-center gap-3 text-gray-600">
          <Spinner />
          <div>กำลังโหลดข้อมูล...</div>
        </div>
      ) : (
        <>
          {/* ✅ Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              title={
                <>
                  อุณหภูมิอากาศ
                  <div className="text-xs text-gray-500 mt-1">- °C</div>
                </>
              }
              value={fmt(latestShow?.temperature, 1)}
              status={statusTemp(latestShow?.temperature)}
              onClick={() => setOpenMetric("temperature")}
            />

            <SummaryCard
              title={
                <>
                  ความชื้นอากาศ
                  <div className="text-xs text-gray-500 mt-1">- %</div>
                </>
              }
              value={fmt(latestShow?.humidity_air, 0)}
              status={statusRH(latestShow?.humidity_air)}
              onClick={() => setOpenMetric("humidity_air")}
            />

            <SummaryCard
              title={
                <>
                  ความชื้นดิน
                  <div className="text-xs text-gray-500 mt-1">- %</div>
                </>
              }
              value={fmt(latestShow?.soil_moisture, 0)}
              status={statusSoil(latestShow?.soil_moisture)}
              onClick={() => setOpenMetric("soil_moisture")}
            />


            <SummaryCard
              title={
                <>
                  แสงที่พืชได้รับ
                  <div className="text-xs text-gray-500 mt-1">- lux</div>
                </>
              }
              value={fmt(lightLuxValue(latestShow), 0)}
              status={statusLightLux(lightLuxValue(latestShow))}
              onClick={() => setOpenMetric("light_lux")}
            />

            <SummaryCard
              title={
                <>
                  ความแห้งของอากาศ (VPD)
                  <div className="text-xs text-gray-500 mt-1">- kPa</div>
                </>
              }
              value={fmt(indexLatestShow?.vpd, 2)}
              status={statusVPD(indexLatestShow?.vpd)}
              onClick={() => setOpenMetric("vpd")}
            />

            <SummaryCard
              title={
                <>
                  ความร้อนสะสม (GDD)
                  <div className="text-xs text-gray-500 mt-1">- °C</div>
                </>
              }
              value={fmt(indexLatestShow?.gdd, 2)}
              status={statusGDD(indexLatestShow?.gdd)}
              onClick={() => setOpenMetric("gdd")}
            />

            <SummaryCard
              title={
                <>
                  จุดน้ำค้าง
                  <div className="text-xs text-gray-500 mt-1">- °C</div>
                </>
              }
              value={fmt(indexLatestShow?.dew_point, 1)}
              status={statusDewPoint(latestShow?.temperature, indexLatestShow?.dew_point)}
              onClick={() => setOpenMetric("dew_point")}
            />

            <SummaryCard
              title={
                <>
                  ความเร็วที่ดินแห้ง
                  <div className="text-xs text-gray-500 mt-1">- %/min</div>
                </>
              }
              value={fmt(indexLatestShow?.soil_drying_rate, 3)}
              status={statusSoilDryingRate(indexLatestShow?.soil_drying_rate)}
              onClick={() => setOpenMetric("soil_drying_rate")}
            />
          </div>

          {/* ✅ แผงเลือกกราฟ (กดปุ่มแล้วค่อยเปิด) */}
          {openChartPicker ? (
            <Card className="p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-lg font-bold text-gray-900">
                    เลือกกราฟที่อยากดู
                  </div>
                  <div className="text-sm text-gray-500">
                    กดเพื่อเปิด/ปิดกราฟ ระบบจะจำไว้ให้
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={selectAllCharts}>
                    เลือกทั้งหมด
                  </Button>
                  <Button variant="outline" onClick={clearCharts}>
                    ซ่อนทั้งหมด
                  </Button>
                  <Button variant="outline" onClick={resetCharts}>
                    ค่าเริ่มต้น
                  </Button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {CHARTS.map((c) => {
                  const active = visibleCharts.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleChart(c.id)}
                      className={`px-3 py-2 rounded-xl text-sm border transition ${
                        active
                          ? "bg-green-50 border-green-300 text-green-800"
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {active ? "✅ " : "➕ "}
                      {c.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 text-xs text-gray-500">
                แสดงอยู่ <b>{visibleCharts.length}</b> / {CHARTS.length} กราฟ
              </div>
            </Card>
          ) : null}

          {/* ✅ Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            {visibleCharts.length === 0 ? (
              <Card className="p-6 lg:col-span-2">
                <div className="text-sm text-gray-600">
                  ยังไม่ได้เลือกกราฟที่อยากดู (กด “เลือกกราฟที่อยากดู” ด้านบน)
                </div>
              </Card>
            ) : (
              CHARTS.filter((c) => visibleCharts.includes(c.id)).map((c) => (
                <LineChartCard
                  key={c.id}
                  title={c.label}
                  unit={c.unit}
                  data={c.type === "sensor" ? chartHistory : filteredIndexHistory}
                  dataKey={c.dataKey}
                  xKey="timestamp"
                />
              ))
            )}
          </div>

          {/* Farm Settings */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold text-gray-900">ตั้งค่าฟาร์ม</div>
              <Badge>อัตโนมัติ</Badge>
            </div>

            {!settings ? (
              <div className="mt-3 text-sm text-gray-500">ยังไม่มีการตั้งค่า</div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div className="rounded-2xl border border-gray-100 p-4">
                    <div className="text-gray-500">ช่วงเวลาวัดค่า</div>
                    <div className="font-semibold text-gray-900 mt-1">
                      {settings.sampling_interval_min ?? "-"} นาที
                    </div>
                  </div>
                  <div className="rounded-2xl border border-gray-100 p-4">
                    <div className="text-gray-500">เวลารดน้ำต่อครั้ง</div>
                    <div className="font-semibold text-gray-900 mt-1">
                      {settings.watering_duration_sec ?? "-"} วินาที
                    </div>
                  </div>
                  <div className="rounded-2xl border border-gray-100 p-4">
                    <div className="text-gray-500">พักก่อนรดน้ำรอบถัดไป</div>
                    <div className="font-semibold text-gray-900 mt-1">
                      {settings.watering_cooldown_min ?? "-"} นาที
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold text-gray-900 mb-2">ตั้งเวลารดน้ำอัตโนมัติ</div>
                  {schedules.length === 0 ? (
                    <div className="text-sm text-gray-500">ยังไม่มีการตั้งเวลา</div>
                  ) : (
                    <div className="space-y-2">
                      {schedules.map((s, idx) => (
                        <div key={idx} className="rounded-2xl border p-4 flex flex-col gap-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-semibold text-gray-900">
                              เวลา {s.time || "06:00"}
                            </div>
                            <Badge variant={s.enabled ? "green" : "gray"}>
                              {s.enabled ? "เปิดใช้งาน" : "ปิด"}
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-700">
                            {s.days?.length
                              ? `วัน: ${s.days.map((d) => WEEKDAY_LABEL[d]).join(", ")}`
                              : "ยังไม่ได้เลือกวัน"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>

        </>
      )}
    </div>
  );
}
