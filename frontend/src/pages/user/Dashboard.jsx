import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import api from "../../services/api.js";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Spinner from "../../components/ui/Spinner.jsx";
import { useToast } from "../../components/ui/ToastProvider.jsx";

import SummaryCard from "../../components/SummaryCard.jsx";
import LineChartCard from "../../components/LineChartCard.jsx";
import Modal from "../../components/ui/Modal.jsx";

import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

console.log("USER DASHBOARD LOADED");

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

function statusRH(rh) {
  if (rh === null || rh === undefined) return "normal";
  const r = Number(rh);
  if (r > 90) return "warning";
  if (r < 40) return "warning";
  return "good";
}

function lightPercentFromLux(lux, maxLux = 20000) {
  if (lux === null || lux === undefined) return null;
  const v = Number(lux);
  if (Number.isNaN(v)) return null;
  const pct = (v / maxLux) * 100;
  return Math.max(0, Math.min(100, pct));
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
  const pct = lightPercentFromLux(lightLux);
  if (pct === null) return "normal";
  if (pct < 10) return "warning";
  if (pct > 95) return "warning";
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

function isSameDay(ts, dateStr) {
  if (!dateStr) return true;
  if (!ts) return false;

  const d = new Date(ts);
  const [y, m, day] = dateStr.split("-").map(Number);
  return d.getFullYear() === y && d.getMonth() + 1 === m && d.getDate() === day;
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

function getIndexInsights({ latest, indexLatest }) {
  const insights = [];
  if (!latest || !indexLatest) return insights;

  const temp = Number(latest.temperature ?? 0);
  const soil = Number(latest.soil_moisture ?? 0);

  const vpd = Number(indexLatest.vpd ?? 0);
  const dew = Number(indexLatest.dew_point ?? 0);
  const soilDry = Number(indexLatest.soil_drying_rate ?? 0);

  if (vpd > 1.5) {
    insights.push({
      title: "อากาศแห้งมาก (VPD สูง)",
      level: "danger",
      message: "ผักบุ้งชอบความชื้น ควรเพิ่มความชื้น/ลดความร้อน และดูให้ดินชื้นพอ",
    });
  } else if (vpd < 0.4) {
    insights.push({
      title: "อากาศชื้นมาก (VPD ต่ำ)",
      level: "warning",
      message: "เสี่ยงเชื้อรา ควรเพิ่มการระบายอากาศ/พัดลม และลดความชื้นสะสม",
    });
  } else {
    insights.push({
      title: "อากาศอยู่ในช่วงเหมาะสม",
      level: "good",
      message: "สภาพแวดล้อมเหมาะต่อการเติบโตของผักบุ้ง รักษาให้คงที่",
    });
  }

  const diff = temp - dew;
  if (diff <= 2) {
    insights.push({
      title: "เสี่ยงเกิดน้ำค้าง",
      level: "warning",
      message: "ควรเพิ่มพัดลม/ระบายอากาศ ลดความชื้นเพื่อลดความเสี่ยงเชื้อรา",
    });
  }

  if (soilDry > 0.3) {
    insights.push({
      title: "ดินแห้งเร็ว",
      level: "danger",
      message: "ควรตรวจระบบน้ำ/เพิ่มรอบรดน้ำ หรือคลุมดินลดการระเหย",
    });
  } else if (soilDry < 0.02 && soil > 70) {
    insights.push({
      title: "ดินชื้นมาก",
      level: "warning",
      message: "ระวังน้ำขัง/รากเน่า อาจลดรอบรดน้ำและตรวจการระบายน้ำ",
    });
  }

  return insights;
}

export default function Dashboard() {
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const [latest, setLatest] = useState(null);
  const [sensorHistory, setSensorHistory] = useState([]);

  const [settings, setSettings] = useState(null);
  const [notifs, setNotifs] = useState([]);

  const [indexLatest, setIndexLatest] = useState(null);
  const [indexHistory, setIndexHistory] = useState([]);

  const [selectedDate, setSelectedDate] = useState("");
  const [lockAllDates, setLockAllDates] = useState(false);

  const [pumpBusy, setPumpBusy] = useState(false);

  const [openChartPicker, setOpenChartPicker] = useState(false);
  const [openExportMenu, setOpenExportMenu] = useState(false);
  const [openExportModal, setOpenExportModal] = useState(false);
  const [openNotifModal, setOpenNotifModal] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMonth, setExportMonth] = useState("");
  const [exportOptions, setExportOptions] = useState({
    sensor: true,
    index: true,
    settings: true,
    notifications: true,
  });
  const [exportMonths, setExportMonths] = useState([]);
  const exportMenuRef = useRef(null);

  const defaultVisibleCharts = ["temperature", "humidity_air", "soil_moisture", "light_lux", "vpd"];
  const [visibleCharts, setVisibleCharts] = useState(() => {
    try {
      const saved = localStorage.getItem("user_dashboard_visibleCharts");
      const parsed = saved ? JSON.parse(saved) : defaultVisibleCharts;
      return parsed.map((id) => (id === "light_percent" ? "light_lux" : id));
    } catch {
      return defaultVisibleCharts;
    }
  });

  const loadAll = useCallback(async (silent = false) => {
    setErr("");
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const bust = `_=${Date.now()}`;

      // ✅ ทำให้ไม่พังทั้งหน้า ถ้าบาง endpoint error
      const results = await Promise.allSettled([
        api.get(`/sensor/latest?${bust}`),
        api.get(`/sensor/history?limit=120&${bust}`),
        api.get(`/settings/my?${bust}`),
        api.get(`/notifications?limit=10&${bust}`),
        api.get(`/dashboard/index-latest?${bust}`),
        api.get(`/dashboard/index-history?limit=120&${bust}`),
      ]);

      const pick = (i) => (results[i].status === "fulfilled" ? results[i].value.data : null);
      const pickArr = (i) => {
        const d = pick(i);
        return Array.isArray(d) ? d : [];
      };

      const latestData = pick(0);
      const historyData = pickArr(1);
      const settingsData = pick(2);
      const notifData = pickArr(3);
      const idxLatestData = pick(4);
      const idxHistoryData = pickArr(5);

      setLatest(latestData || null);
      setSensorHistory(historyData);

      setSettings(settingsData || null);
      setNotifs(notifData);

      setIndexLatest(idxLatestData || null);
      setIndexHistory(idxHistoryData);

      // ถ้า settings ล้ม ให้โชว์เตือนเบา ๆ (แต่ไม่ blank)
      if (results[2].status === "rejected") {
        console.warn("settings/my failed:", results[2].reason);
      }

      setLastUpdatedAt(new Date());
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      if (!silent) setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAll(false);
    const t = setInterval(() => loadAll(true), 5000);
    return () => clearInterval(t);
  }, [loadAll]);

  useEffect(() => {
    localStorage.setItem("user_dashboard_visibleCharts", JSON.stringify(visibleCharts));
  }, [visibleCharts]);

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

  const availableDates = useMemo(() => {
    const set = new Set();

    (sensorHistory || []).forEach((x) => {
      if (!x?.timestamp) return;
      const d = new Date(x.timestamp);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      set.add(`${yyyy}-${mm}-${dd}`);
    });

    (indexHistory || []).forEach((x) => {
      if (!x?.timestamp) return;
      const d = new Date(x.timestamp);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      set.add(`${yyyy}-${mm}-${dd}`);
    });

    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [sensorHistory, indexHistory]);

  const loadExportMonths = useCallback(async () => {
    try {
      const res = await api.get(`/dashboard/available-months?_=${Date.now()}`);
      const months = Array.isArray(res.data?.months) ? res.data.months : [];
      setExportMonths(months);
    } catch (e) {
      console.warn("loadExportMonths error:", e);
    }
  }, []);

  useEffect(() => {
    if (!selectedDate) return;
    if (!availableDates.includes(selectedDate)) {
      setSelectedDate("");
      setLockAllDates(false);
    }
  }, [availableDates, selectedDate]);

  useEffect(() => {
    loadExportMonths();
  }, [loadExportMonths]);

  useEffect(() => {
    if (!exportMonth) return;
    if (!exportMonths.includes(exportMonth)) setExportMonth("");
  }, [exportMonths, exportMonth]);

  useEffect(() => {
    if (selectedDate) return;
    if (lockAllDates) return;
    if (!availableDates.length) return;
    setSelectedDate(availableDates[0]);
  }, [availableDates, selectedDate, lockAllDates]);

  const filteredSensorHistory = useMemo(() => {
    if (!selectedDate) return sensorHistory;
    return sensorHistory.filter((x) => isSameDay(x.timestamp, selectedDate));
  }, [sensorHistory, selectedDate]);

  const filteredIndexHistory = useMemo(() => {
    if (!selectedDate) return indexHistory;
    return indexHistory.filter((x) => isSameDay(x.timestamp, selectedDate));
  }, [indexHistory, selectedDate]);

  const latestShow = useMemo(() => {
    if (!selectedDate) return latest;
    if (!filteredSensorHistory.length) return null;
    const sorted = [...filteredSensorHistory].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return sorted[0];
  }, [selectedDate, latest, filteredSensorHistory]);

  const indexLatestShow = useMemo(() => {
    if (!selectedDate) return indexLatest;
    if (!filteredIndexHistory.length) return null;
    const sorted = [...filteredIndexHistory].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return sorted[0];
  }, [selectedDate, indexLatest, filteredIndexHistory]);

  const chartData = useMemo(() => {
    return (filteredSensorHistory || [])
      .slice()
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map((d) => ({
        time: d.timestamp,
        temperature: Number(d.temperature ?? 0),
        humidity_air: Number(d.humidity_air ?? 0),
        soil_moisture: Number(d.soil_moisture ?? 0),
        light_lux: lightLuxValue(d),
      }));
  }, [filteredSensorHistory]);

  const indexChartData = useMemo(() => {
    return (filteredIndexHistory || [])
      .slice()
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map((d) => ({
        time: d.timestamp,
        vpd: Number(d.vpd ?? 0),
        gdd: Number(d.gdd ?? 0),
        dew_point: Number(d.dew_point ?? 0),
        soil_drying_rate: Number(d.soil_drying_rate ?? 0),
      }));
  }, [filteredIndexHistory]);

  const toggleChart = (id) => {
    setVisibleCharts((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const selectAllCharts = () => setVisibleCharts(CHARTS.map((c) => c.id));
  const clearCharts = () => setVisibleCharts([]);
  const resetCharts = () => setVisibleCharts(defaultVisibleCharts);

  const tempTh = useMemo(() => getSetting(settings, "temp", "temp_threshold"), [settings]);
  const rhTh = useMemo(() => getSetting(settings, "rh", "rh_threshold"), [settings]);
  const soilTh = useMemo(() => getSetting(settings, "soil", "soil_threshold"), [settings]);
  const samplingMin = useMemo(() => getSetting(settings, "sampling_interval_min", "sampling_interval"), [settings]);

  const statusBadges = useMemo(() => {
    if (!latestShow || !settings) return [];
    const out = [];

    if (tempTh !== undefined) {
      out.push({
        v: Number(latestShow.temperature) >= Number(tempTh) ? "red" : "green",
        t: Number(latestShow.temperature) >= Number(tempTh) ? "อุณหภูมิสูง" : "อุณหภูมิปกติ",
      });
    }

    if (rhTh !== undefined) {
      out.push({
        v: Number(latestShow.humidity_air) >= Number(rhTh) ? "blue" : "yellow",
        t: Number(latestShow.humidity_air) >= Number(rhTh) ? "ความชื้นอากาศสูง" : "ความชื้นอากาศต่ำ",
      });
    }

    if (soilTh !== undefined) {
      out.push({
        v: Number(latestShow.soil_moisture) <= Number(soilTh) ? "red" : "green",
        t: Number(latestShow.soil_moisture) <= Number(soilTh) ? "ดินแห้ง" : "ดินชื้น",
      });
    }

    return out;
  }, [latestShow, settings, tempTh, rhTh, soilTh]);

  const insights = useMemo(
    () => getIndexInsights({ latest: latestShow, indexLatest: indexLatestShow }),
    [latestShow, indexLatestShow]
  );

  async function sendPump(command) {
    try {
      setPumpBusy(true);
      await api.post("/device/command", { command });
      const action = command === "ON" ? "เริ่มรดน้ำ" : command === "OFF" ? "หยุดรดน้ำ" : command;
      toast.success(`สั่งงานปั๊มสำเร็จ: ${action}`);
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message || "ส่งคำสั่งไม่สำเร็จ");
    } finally {
      setPumpBusy(false);
    }
  }

  const exportExcel = useCallback(async () => {
    try {
      setExportBusy(true);
      toast.info("กำลังส่งออกไฟล์ Excel...");

      const baseSensorHistory = selectedDate ? filteredSensorHistory : sensorHistory;
      const baseIndexHistory = selectedDate ? filteredIndexHistory : indexHistory;

      let exportSensorHistory = filterByMonth(baseSensorHistory, (x) => x.timestamp, exportMonth);
      let exportIndexHistory = filterByMonth(baseIndexHistory, (x) => x.timestamp, exportMonth);
      let exportNotifs = filterByMonth(notifs, (n) => n.created_at || n.timestamp, exportMonth);

      if (exportMonth) {
        const range = monthRange(exportMonth);
        if (range) {
          const [sensorRes, indexRes, notifRes] = await Promise.all([
            exportOptions.sensor ? api.get(`/sensor/history?start=${range.start}&end=${range.end}&limit=20000`) : null,
            exportOptions.index ? api.get(`/dashboard/index-history?start=${range.start}&end=${range.end}&limit=20000`) : null,
            exportOptions.notifications ? api.get(`/notifications?start=${range.start}&end=${range.end}&limit=20000`) : null,
          ]);

          if (sensorRes) exportSensorHistory = Array.isArray(sensorRes.data) ? sensorRes.data : [];
          if (indexRes) exportIndexHistory = Array.isArray(indexRes.data) ? indexRes.data : [];
          if (notifRes) exportNotifs = Array.isArray(notifRes.data) ? notifRes.data : [];
        }
      }

      const wb = XLSX.utils.book_new();

      if (exportOptions.sensor) {
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(
            exportSensorHistory.map((x) => ({
              timestamp: x.timestamp,
              temperature: x.temperature,
              humidity_air: x.humidity_air,
              soil_moisture: x.soil_moisture,
              soil_raw_adc: x.soil_raw_adc,
              light_percent: x.light_percent,
              light_raw_adc: x.light_raw_adc,
              light_lux: x.light_lux,
            }))
          ),
          "SensorHistory"
        );
      }

      if (exportOptions.index) {
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

      if (exportOptions.settings) {
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
          "Settings"
        );
      }

      if (exportOptions.notifications) {
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
          "Notifications"
        );
      }

      const hasAny = exportOptions.sensor || exportOptions.index || exportOptions.settings || exportOptions.notifications;
      if (!hasAny) {
        toast.error("กรุณาเลือกอย่างน้อย 1 หมวดข้อมูล");
        return;
      }

      const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const file = new Blob([excelBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const suffix = exportMonth ? `_M${exportMonth}` : selectedDate ? `_${selectedDate}` : "";
      const filename = `SmartFarm_UserDashboard${suffix}.xlsx`;

      saveAs(file, filename);
      toast.success("ส่งออกไฟล์ Excel สำเร็จ 🎉");
    } catch (e) {
      console.error("Export Excel error:", e);
      toast.error(e?.response?.data?.error || e.message || "ส่งออกไฟล์ไม่สำเร็จ");
    } finally {
      setExportBusy(false);
    }
  }, [
    selectedDate,
    exportMonth,
    filteredSensorHistory,
    filteredIndexHistory,
    sensorHistory,
    indexHistory,
    settings,
    notifs,
    exportOptions,
    toast,
  ]);

  return (
    <div className="space-y-5">
      <Modal
        open={openNotifModal}
        title={`แจ้งเตือนล่าสุด (${notifs.length})`}
        onClose={() => setOpenNotifModal(false)}
      >
        {notifs.length === 0 ? (
          <div className="text-sm text-gray-500">ยังไม่มีการแจ้งเตือน</div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-auto pr-1">
            {notifs.map((n) => (
              <div key={n._id} className="rounded-2xl border p-4 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-gray-900">{n.alert_type || "แจ้งเตือน"}</div>
                  <Badge>{n.severity || "info"}</Badge>
                </div>
                <div className="text-sm text-gray-700">{n.details || "-"}</div>
                <div className="text-xs text-gray-500">
                  {n.timestamp ? new Date(n.timestamp).toLocaleString() : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={openExportModal} title="เลือกข้อมูลที่จะส่งออก" onClose={() => setOpenExportModal(false)}>
        <div className="space-y-4">
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
              <Button variant="outline" onClick={() => setExportMonth("")}>ล้างเดือน</Button>
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
              />
              ค่าตั้งระบบ
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={exportOptions.notifications}
                onChange={(e) => setExportOptions((p) => ({ ...p, notifications: e.target.checked }))}
              />
              การแจ้งเตือน
            </label>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => {
                setOpenExportModal(false);
                exportExcel();
              }}
              disabled={exportBusy}
            >
              ส่งออก
            </Button>
            <Button variant="outline" onClick={() => setOpenExportModal(false)}>
              ยกเลิก
            </Button>
          </div>
        </div>
      </Modal>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-2xl font-bold text-gray-900">ภาพรวมแปลงผักบุ้ง</div>
          <div className="text-sm text-gray-500 flex items-center gap-2">
            <span>ดูข้อมูลสำหรับการปลูกผักบุ้งของคุณ</span>
            {refreshing ? <Badge variant="blue">กำลังอัปเดต…</Badge> : null}
            {lastUpdatedAt ? (
              <span className="text-xs text-gray-400">อัปเดตล่าสุด: {lastUpdatedAt.toLocaleTimeString()}</span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="outline" onClick={() => setOpenChartPicker((v) => !v)}>
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

          <div className="relative" ref={exportMenuRef}>
            <Button onClick={() => setOpenExportMenu((v) => !v)}>ส่งออก Excel</Button>
            {openExportMenu ? (
              <div className="absolute right-0 mt-2 w-72 bg-white border rounded-2xl shadow-lg z-50 overflow-hidden">
                <button
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm disabled:opacity-50"
                  onClick={() => {
                    setOpenExportMenu(false);
                    setOpenExportModal(true);
                  }}
                  disabled={exportBusy}
                >
                  📌 ส่งออกข้อมูลแปลงผักบุ้ง (Excel)
                  <div className="text-xs text-gray-500 mt-1">
                    เลือกหมวดข้อมูลได้ {selectedDate ? ` (เฉพาะวันที่ ${selectedDate})` : ""}
                  </div>
                </button>
              </div>
            ) : null}
          </div>

          <Button variant="outline" onClick={() => loadAll(false)} disabled={loading}>
            {loading ? "กำลังโหลด..." : "รีเฟรช"}
          </Button>

          {/* ✅ user ควบคุมปั๊มได้ (ถ้าอยากจำกัดสิทธิ ให้คอมเมนต์ 2 ปุ่มนี้ออก) */}
          <Button onClick={() => sendPump("ON")} disabled={pumpBusy}>
            {pumpBusy ? "กำลังส่ง..." : "เริ่มรดน้ำ"}
          </Button>
          <Button variant="danger" onClick={() => sendPump("OFF")} disabled={pumpBusy}>
            {pumpBusy ? "กำลังส่ง..." : "หยุดรดน้ำ"}
          </Button>
        </div>
      </div>

      {openChartPicker ? (
        <Card className="p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-lg font-bold text-gray-900">เลือกกราฟที่อยากดู</div>
              <div className="text-sm text-gray-500">กดเพื่อเปิด/ปิดกราฟ ระบบจะจำไว้ให้</div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={selectAllCharts}>เลือกทั้งหมด</Button>
              <Button variant="outline" onClick={clearCharts}>ซ่อนทั้งหมด</Button>
              <Button variant="outline" onClick={resetCharts}>ค่าเริ่มต้น</Button>
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

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2 items-center">
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
                <option key={d} value={d}>{d}</option>
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
        </div>

        <div className="mt-3 text-sm text-gray-700">
          {selectedDate ? (
            <>📅 กำลังแสดงข้อมูลของวันที่ <b>{selectedDate}</b></>
          ) : (
            <>📅 กำลังแสดงข้อมูลแบบรวม</>
          )}
        </div>
      </Card>

      {loading && (
        <Card className="p-5">
          <div className="flex items-center gap-3 text-gray-700">
            <Spinner />
            <div>กำลังโหลดข้อมูล...</div>
          </div>
        </Card>
      )}

      {!loading && err && (
        <Card className="p-5 border-red-200 bg-red-50">
          <div className="text-red-700 font-medium">เกิดข้อผิดพลาด</div>
          <div className="text-red-700 text-sm mt-1">{err}</div>
        </Card>
      )}

      {!loading && !err && (
        <>
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-semibold text-gray-800 mr-2">สถานะ:</div>
              {statusBadges.length === 0 ? (
                <Badge variant="gray">ยังไม่มีข้อมูลเพียงพอ</Badge>
              ) : (
                statusBadges.map((b, idx) => (
                  <Badge key={idx} variant={b.v}>{b.t}</Badge>
                ))
              )}
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <SummaryCard title={<>อุณหภูมิอากาศ<div className="text-xs text-gray-500 mt-1">- °C</div></>} value={fmt(latestShow?.temperature, 1)} status={statusTemp(latestShow?.temperature)} />
            <SummaryCard title={<>ความชื้นอากาศ<div className="text-xs text-gray-500 mt-1">- %</div></>} value={fmt(latestShow?.humidity_air, 0)} status={statusRH(latestShow?.humidity_air)} />
            <SummaryCard title={<>ความชื้นดิน<div className="text-xs text-gray-500 mt-1">- %</div></>} value={fmt(latestShow?.soil_moisture, 0)} status={statusSoil(latestShow?.soil_moisture)} />
            <SummaryCard title={<>แสงที่พืชได้รับ<div className="text-xs text-gray-500 mt-1">- lux</div></>} value={fmt(lightLuxValue(latestShow), 0)} status={statusLightLux(lightLuxValue(latestShow))} />

            <SummaryCard title={<>ความแห้งของอากาศ (VPD)<div className="text-xs text-gray-500 mt-1">- kPa</div></>} value={fmt(indexLatestShow?.vpd, 2)} status={statusVPD(indexLatestShow?.vpd)} />
            <SummaryCard title={<>ความร้อนสะสม (GDD)<div className="text-xs text-gray-500 mt-1">- °C</div></>} value={fmt(indexLatestShow?.gdd, 2)} status={statusGDD(indexLatestShow?.gdd)} />
            <SummaryCard title={<>จุดน้ำค้าง<div className="text-xs text-gray-500 mt-1">- °C</div></>} value={fmt(indexLatestShow?.dew_point, 1)} status={statusDewPoint(latestShow?.temperature, indexLatestShow?.dew_point)} />
            <SummaryCard title={<>ความเร็วที่ดินแห้ง<div className="text-xs text-gray-500 mt-1">- %/min</div></>} value={fmt(indexLatestShow?.soil_drying_rate, 3)} status={statusSoilDryingRate(indexLatestShow?.soil_drying_rate)} />
          </div>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold text-gray-900">สรุปสำหรับผักบุ้ง</div>
                <div className="text-sm text-gray-500">สรุปสภาพแวดล้อมแบบเข้าใจง่าย</div>
              </div>
              <Badge variant="blue">คำแนะนำ</Badge>
            </div>

            {!latestShow || !indexLatestShow ? (
              <div className="mt-4 text-sm text-gray-500">ยังไม่มีข้อมูลพอสำหรับการสรุป</div>
            ) : (
              <div className="mt-4 space-y-3">
                {insights.map((it, idx) => (
                  <div
                    key={idx}
                    className={[
                      "rounded-xl border p-4 text-sm",
                      it.level === "danger"
                        ? "border-red-200 bg-red-50 text-red-800"
                        : it.level === "warning"
                        ? "border-yellow-200 bg-yellow-50 text-yellow-800"
                        : "border-green-200 bg-green-50 text-green-800",
                    ].join(" ")}
                  >
                    <div className="font-semibold">{it.title}</div>
                    <div className="mt-1 leading-relaxed">{it.message}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

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
                  data={c.type === "sensor" ? chartData : indexChartData}
                  dataKey={c.dataKey}
                  xKey="time"
                />
              ))
            )}
          </div>

          <div className="grid grid-cols-1 gap-4">
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold text-gray-900">ค่าตั้งระบบรดน้ำ</div>
                <Badge variant="gray">ตั้งค่า</Badge>
              </div>

              {!settings ? (
                <div className="mt-3 text-sm text-gray-500">
                  ยังไม่มีการตั้งค่า หรือดึงข้อมูลไม่สำเร็จ (แต่หน้านี้ยังใช้งานได้)
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="text-gray-500">เตือนเมื่ออุณหภูมิสูงกว่า</div>
                  <div className="font-medium">{tempTh ?? "-"} °C</div>

                  <div className="text-gray-500">เตือนเมื่อความชื้นอากาศสูงกว่า</div>
                  <div className="font-medium">{rhTh ?? "-"} %</div>

                  <div className="text-gray-500">เตือนเมื่อดินแห้งต่ำกว่า</div>
                  <div className="font-medium">{soilTh ?? "-"} %</div>

                  <div className="text-gray-500">ช่วงเวลาวัดค่า</div>
                  <div className="font-medium">{samplingMin ?? "-"} นาที</div>
                </div>
              )}
            </Card>

          </div>

          {!latestShow && filteredSensorHistory.length === 0 && (
            <Card className="p-5 bg-emerald-50 border-emerald-200">
              <div className="font-semibold text-emerald-900">ยังไม่มีข้อมูลจากเซนเซอร์</div>
              <div className="text-sm text-emerald-800 mt-1">
                เมื่ออุปกรณ์ส่งข้อมูลเข้ามา หน้านี้จะอัปเดตเองทุก 5 วินาที
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
