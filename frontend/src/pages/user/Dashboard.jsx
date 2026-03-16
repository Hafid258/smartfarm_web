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
import ClockTimePicker from "../../components/ui/ClockTimePicker.jsx";

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

function parseTimeToMinutes(v) {
  if (!v || typeof v !== "string") return null;
  const [hh, mm] = v.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

const CHARTS = [
  { id: "temperature", label: "เธญเธธเธ“เธซเธ เธนเธกเธดเธญเธฒเธเธฒเธจ (ยฐC)", type: "sensor", dataKey: "temperature", unit: "ยฐC" },
  { id: "humidity_air", label: "เธเธงเธฒเธกเธเธทเนเธเธญเธฒเธเธฒเธจ (%)", type: "sensor", dataKey: "humidity_air", unit: "%" },
  { id: "soil_moisture", label: "เธเธงเธฒเธกเธเธทเนเธเธ”เธดเธ (%)", type: "sensor", dataKey: "soil_moisture", unit: "%" },
  { id: "light_lux", label: "เนเธชเธเธ—เธตเนเธเธทเธเนเธ”เนเธฃเธฑเธ (lux)", type: "sensor", dataKey: "light_lux", unit: "lux" },

  { id: "vpd", label: "เธเธงเธฒเธกเนเธซเนเธเธเธญเธเธญเธฒเธเธฒเธจ (VPD, kPa)", type: "index", dataKey: "vpd", unit: "kPa" },
  { id: "gdd", label: "เธเธงเธฒเธกเธฃเนเธญเธเธชเธฐเธชเธก (GDD, ยฐC)", type: "index", dataKey: "gdd", unit: "ยฐC" },
  { id: "dew_point", label: "เธเธธเธ”เธเนเธณเธเนเธฒเธ (ยฐC)", type: "index", dataKey: "dew_point", unit: "ยฐC" },
  { id: "soil_drying_rate", label: "เธเธงเธฒเธกเน€เธฃเนเธงเธ—เธตเนเธ”เธดเธเนเธซเนเธ (%/เธเธฒเธ—เธต)", type: "index", dataKey: "soil_drying_rate", unit: "%/min" },
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
      title: "เธญเธฒเธเธฒเธจเนเธซเนเธเธกเธฒเธ (VPD เธชเธนเธ)",
      level: "danger",
      message: "เธเธฑเธเธเธธเนเธเธเธญเธเธเธงเธฒเธกเธเธทเนเธ เธเธงเธฃเน€เธเธดเนเธกเธเธงเธฒเธกเธเธทเนเธ/เธฅเธ”เธเธงเธฒเธกเธฃเนเธญเธ เนเธฅเธฐเธ”เธนเนเธซเนเธ”เธดเธเธเธทเนเธเธเธญ",
    });
  } else if (vpd < 0.4) {
    insights.push({
      title: "เธญเธฒเธเธฒเธจเธเธทเนเธเธกเธฒเธ (VPD เธ•เนเธณ)",
      level: "warning",
      message: "เน€เธชเธตเนเธขเธเน€เธเธทเนเธญเธฃเธฒ เธเธงเธฃเน€เธเธดเนเธกเธเธฒเธฃเธฃเธฐเธเธฒเธขเธญเธฒเธเธฒเธจ/เธเธฑเธ”เธฅเธก เนเธฅเธฐเธฅเธ”เธเธงเธฒเธกเธเธทเนเธเธชเธฐเธชเธก",
    });
  } else {
    insights.push({
      title: "เธญเธฒเธเธฒเธจเธญเธขเธนเนเนเธเธเนเธงเธเน€เธซเธกเธฒเธฐเธชเธก",
      level: "good",
      message: "เธชเธ เธฒเธเนเธงเธ”เธฅเนเธญเธกเน€เธซเธกเธฒเธฐเธ•เนเธญเธเธฒเธฃเน€เธ•เธดเธเนเธ•เธเธญเธเธเธฑเธเธเธธเนเธ เธฃเธฑเธเธฉเธฒเนเธซเนเธเธเธ—เธตเน",
    });
  }

  const diff = temp - dew;
  if (diff <= 2) {
    insights.push({
      title: "เน€เธชเธตเนเธขเธเน€เธเธดเธ”เธเนเธณเธเนเธฒเธ",
      level: "warning",
      message: "เธเธงเธฃเน€เธเธดเนเธกเธเธฑเธ”เธฅเธก/เธฃเธฐเธเธฒเธขเธญเธฒเธเธฒเธจ เธฅเธ”เธเธงเธฒเธกเธเธทเนเธเน€เธเธทเนเธญเธฅเธ”เธเธงเธฒเธกเน€เธชเธตเนเธขเธเน€เธเธทเนเธญเธฃเธฒ",
    });
  }

  if (soilDry > 0.3) {
    insights.push({
      title: "เธ”เธดเธเนเธซเนเธเน€เธฃเนเธง",
      level: "danger",
      message: "เธเธงเธฃเธ•เธฃเธงเธเธฃเธฐเธเธเธเนเธณ/เน€เธเธดเนเธกเธฃเธญเธเธฃเธ”เธเนเธณ เธซเธฃเธทเธญเธเธฅเธธเธกเธ”เธดเธเธฅเธ”เธเธฒเธฃเธฃเธฐเน€เธซเธข",
    });
  } else if (soilDry < 0.02 && soil > 70) {
    insights.push({
      title: "เธ”เธดเธเธเธทเนเธเธกเธฒเธ",
      level: "warning",
      message: "เธฃเธฐเธงเธฑเธเธเนเธณเธเธฑเธ/เธฃเธฒเธเน€เธเนเธฒ เธญเธฒเธเธฅเธ”เธฃเธญเธเธฃเธ”เธเนเธณเนเธฅเธฐเธ•เธฃเธงเธเธเธฒเธฃเธฃเธฐเธเธฒเธขเธเนเธณ",
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
  const [farmSummary, setFarmSummary] = useState(null);

  const [selectedDate, setSelectedDate] = useState("");
  const [lockAllDates, setLockAllDates] = useState(false);
  const [timeRange, setTimeRange] = useState("all"); // all | 1h | 3h | 6h | 12h | 24h | 72h | custom
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

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

      // โ… เธ—เธณเนเธซเนเนเธกเนเธเธฑเธเธ—เธฑเนเธเธซเธเนเธฒ เธ–เนเธฒเธเธฒเธ endpoint error
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

      // เธ–เนเธฒ settings เธฅเนเธก เนเธซเนเนเธเธงเนเน€เธ•เธทเธญเธเน€เธเธฒ เน (เนเธ•เนเนเธกเน blank)
      if (results[2].status === "rejected") {
        console.warn("settings/my failed:", results[2].reason);
      }

      setLastUpdatedAt(new Date());
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || "เนเธซเธฅเธ”เธเนเธญเธกเธนเธฅเนเธกเนเธชเธณเน€เธฃเนเธ");
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

  const loadFarmSummary = useCallback(async () => {
    try {
      const date = selectedDate || todayStr();
      const res = await api.get(`/dashboard/farm-summary?date=${encodeURIComponent(date)}&_=${Date.now()}`);
      setFarmSummary(res.data || null);
    } catch (e) {
      console.warn("loadFarmSummary error:", e);
    }
  }, [selectedDate]);

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
    loadFarmSummary();
  }, [loadFarmSummary]);

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
    let list = !selectedDate
      ? sensorHistory
      : sensorHistory.filter((x) => isSameDay(x.timestamp, selectedDate));
    if (timeRange === "all") return list;
    if (timeRange === "custom") {
      const fromMin = parseTimeToMinutes(customFrom);
      const toMin = parseTimeToMinutes(customTo);
      return list.filter((x) => {
        const ts = new Date(x?.timestamp || 0).getTime();
        if (!Number.isFinite(ts)) return false;
        const d = new Date(ts);
        const at = d.getHours() * 60 + d.getMinutes();
        if (fromMin === null && toMin === null) return true;
        if (fromMin !== null && toMin === null) return at >= fromMin;
        if (fromMin === null && toMin !== null) return at <= toMin;
        if (fromMin <= toMin) return at >= fromMin && at <= toMin;
        return at >= fromMin || at <= toMin;
      });
    }
    const hours = Number(String(timeRange).replace("h", ""));
    if (!Number.isFinite(hours) || hours <= 0) return list;
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return list.filter((x) => {
      const ts = new Date(x?.timestamp || 0).getTime();
      return Number.isFinite(ts) && ts >= cutoff;
    });
  }, [sensorHistory, selectedDate, timeRange, customFrom, customTo]);

  const filteredIndexHistory = useMemo(() => {
    let list = !selectedDate
      ? indexHistory
      : indexHistory.filter((x) => isSameDay(x.timestamp, selectedDate));
    if (timeRange === "all") return list;
    if (timeRange === "custom") {
      const fromMin = parseTimeToMinutes(customFrom);
      const toMin = parseTimeToMinutes(customTo);
      return list.filter((x) => {
        const ts = new Date(x?.timestamp || 0).getTime();
        if (!Number.isFinite(ts)) return false;
        const d = new Date(ts);
        const at = d.getHours() * 60 + d.getMinutes();
        if (fromMin === null && toMin === null) return true;
        if (fromMin !== null && toMin === null) return at >= fromMin;
        if (fromMin === null && toMin !== null) return at <= toMin;
        if (fromMin <= toMin) return at >= fromMin && at <= toMin;
        return at >= fromMin || at <= toMin;
      });
    }
    const hours = Number(String(timeRange).replace("h", ""));
    if (!Number.isFinite(hours) || hours <= 0) return list;
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return list.filter((x) => {
      const ts = new Date(x?.timestamp || 0).getTime();
      return Number.isFinite(ts) && ts >= cutoff;
    });
  }, [indexHistory, selectedDate, timeRange, customFrom, customTo]);

  const latestShow = useMemo(() => {
    if (!selectedDate && timeRange === "all") return latest;
    if (!filteredSensorHistory.length) return null;
    const sorted = [...filteredSensorHistory].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return sorted[0];
  }, [selectedDate, timeRange, latest, filteredSensorHistory]);

  const indexLatestShow = useMemo(() => {
    if (!selectedDate && timeRange === "all") return indexLatest;
    if (!filteredIndexHistory.length) return null;
    const sorted = [...filteredIndexHistory].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return sorted[0];
  }, [selectedDate, timeRange, indexLatest, filteredIndexHistory]);

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
        t: Number(latestShow.temperature) >= Number(tempTh) ? "เธญเธธเธ“เธซเธ เธนเธกเธดเธชเธนเธ" : "เธญเธธเธ“เธซเธ เธนเธกเธดเธเธเธ•เธด",
      });
    }

    if (rhTh !== undefined) {
      out.push({
        v: Number(latestShow.humidity_air) >= Number(rhTh) ? "blue" : "yellow",
        t: Number(latestShow.humidity_air) >= Number(rhTh) ? "เธเธงเธฒเธกเธเธทเนเธเธญเธฒเธเธฒเธจเธชเธนเธ" : "เธเธงเธฒเธกเธเธทเนเธเธญเธฒเธเธฒเธจเธ•เนเธณ",
      });
    }

    if (soilTh !== undefined) {
      out.push({
        v: Number(latestShow.soil_moisture) <= Number(soilTh) ? "red" : "green",
        t: Number(latestShow.soil_moisture) <= Number(soilTh) ? "เธ”เธดเธเนเธซเนเธ" : "เธ”เธดเธเธเธทเนเธ",
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
      const action = command === "ON" ? "เน€เธฃเธดเนเธกเธฃเธ”เธเนเธณ" : command === "OFF" ? "เธซเธขเธธเธ”เธฃเธ”เธเนเธณ" : command;
      toast.success(`เธชเธฑเนเธเธเธฒเธเธเธฑเนเธกเธชเธณเน€เธฃเนเธ: ${action}`);
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message || "เธชเนเธเธเธณเธชเธฑเนเธเนเธกเนเธชเธณเน€เธฃเนเธ");
    } finally {
      setPumpBusy(false);
    }
  }

  const exportExcel = useCallback(async () => {
    try {
      setExportBusy(true);
      toast.info("เธเธณเธฅเธฑเธเธชเนเธเธญเธญเธเนเธเธฅเน Excel...");

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
        toast.error("เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธเธญเธขเนเธฒเธเธเนเธญเธข 1 เธซเธกเธงเธ”เธเนเธญเธกเธนเธฅ");
        return;
      }

      const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const file = new Blob([excelBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const suffix = exportMonth ? `_M${exportMonth}` : selectedDate ? `_${selectedDate}` : "";
      const filename = `SmartFarm_UserDashboard${suffix}.xlsx`;

      saveAs(file, filename);
      toast.success("เธชเนเธเธญเธญเธเนเธเธฅเน Excel เธชเธณเน€เธฃเนเธ ๐");
    } catch (e) {
      console.error("Export Excel error:", e);
      toast.error(e?.response?.data?.error || e.message || "เธชเนเธเธญเธญเธเนเธเธฅเนเนเธกเนเธชเธณเน€เธฃเนเธ");
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
    <div className="space-y-5 text-slate-800">
      <Modal
        open={openNotifModal}
        title={`เนเธเนเธเน€เธ•เธทเธญเธเธฅเนเธฒเธชเธธเธ” (${notifs.length})`}
        onClose={() => setOpenNotifModal(false)}
      >
        {notifs.length === 0 ? (
          <div className="text-sm text-gray-500">เธขเธฑเธเนเธกเนเธกเธตเธเธฒเธฃเนเธเนเธเน€เธ•เธทเธญเธ</div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-auto pr-1">
            {notifs.map((n) => (
              <div key={n._id} className="rounded-2xl border p-4 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-gray-900">{n.alert_type || "เนเธเนเธเน€เธ•เธทเธญเธ"}</div>
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

      <Modal open={openExportModal} title="เน€เธฅเธทเธญเธเธเนเธญเธกเธนเธฅเธ—เธตเนเธเธฐเธชเนเธเธญเธญเธ" onClose={() => setOpenExportModal(false)}>
        <div className="space-y-4 text-slate-800">
          <div>
            <div className="text-sm text-gray-600 mb-1">เน€เธฅเธทเธญเธเน€เธ”เธทเธญเธ (เน€เธเธเธฒเธฐเน€เธ”เธทเธญเธเธ—เธตเนเธกเธตเธเนเธญเธกเธนเธฅ)</div>
            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={exportMonth}
                onChange={(e) => setExportMonth(e.target.value)}
                className="border rounded-xl px-3 py-2 text-sm bg-white"
              >
                <option value="">เธ—เธธเธเน€เธ”เธทเธญเธ</option>
                {exportMonths.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <Button variant="outline" onClick={() => setExportMonth("")}>เธฅเนเธฒเธเน€เธ”เธทเธญเธ</Button>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={exportOptions.sensor}
                onChange={(e) => setExportOptions((p) => ({ ...p, sensor: e.target.checked }))}
              />
              เธเธฃเธฐเธงเธฑเธ•เธดเธเนเธฒเน€เธเธเน€เธเธญเธฃเน
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={exportOptions.index}
                onChange={(e) => setExportOptions((p) => ({ ...p, index: e.target.checked }))}
              />
              เธเนเธฒเธเธณเธเธงเธ“ (Index)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={exportOptions.settings}
                onChange={(e) => setExportOptions((p) => ({ ...p, settings: e.target.checked }))}
              />
              เธเนเธฒเธ•เธฑเนเธเธฃเธฐเธเธ
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={exportOptions.notifications}
                onChange={(e) => setExportOptions((p) => ({ ...p, notifications: e.target.checked }))}
              />
              เธเธฒเธฃเนเธเนเธเน€เธ•เธทเธญเธ
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
              เธชเนเธเธญเธญเธ
            </Button>
            <Button variant="outline" onClick={() => setOpenExportModal(false)}>
              เธขเธเน€เธฅเธดเธ
            </Button>
          </div>
        </div>
      </Modal>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-2xl font-bold text-gray-900">เธ เธฒเธเธฃเธงเธกเนเธเธฅเธเธเธฑเธเธเธธเนเธ</div>
          <div className="text-sm text-gray-500 flex items-center gap-2">
            <span>เธ”เธนเธเนเธญเธกเธนเธฅเธชเธณเธซเธฃเธฑเธเธเธฒเธฃเธเธฅเธนเธเธเธฑเธเธเธธเนเธเธเธญเธเธเธธเธ“</span>
            {refreshing ? <Badge variant="blue">เธเธณเธฅเธฑเธเธญเธฑเธเน€เธ”เธ•โ€ฆ</Badge> : null}
            {lastUpdatedAt ? (
              <span className="text-xs text-gray-400">เธญเธฑเธเน€เธ”เธ•เธฅเนเธฒเธชเธธเธ”: {lastUpdatedAt.toLocaleTimeString()}</span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="outline" onClick={() => setOpenChartPicker(true)}>
            เน€เธฅเธทเธญเธเธเธฃเธฒเธเธ—เธตเนเธญเธขเธฒเธเธ”เธน
          </Button>

          <Button
            variant="outline"
            onClick={() => setOpenNotifModal(true)}
            className="relative"
            title="เนเธเนเธเน€เธ•เธทเธญเธเธฅเนเธฒเธชเธธเธ”"
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
            <span className="ml-2">เนเธเนเธเน€เธ•เธทเธญเธ</span>
            {notifs.length > 0 ? (
              <span className="ml-2 min-w-6 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">
                {notifs.length}
              </span>
            ) : null}
          </Button>

          <div className="relative" ref={exportMenuRef}>
            <Button onClick={() => setOpenExportMenu((v) => !v)}>เธชเนเธเธญเธญเธ Excel</Button>
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
                  ๐“ เธชเนเธเธญเธญเธเธเนเธญเธกเธนเธฅเนเธเธฅเธเธเธฑเธเธเธธเนเธ (Excel)
                  <div className="text-xs text-gray-500 mt-1">
                    เน€เธฅเธทเธญเธเธซเธกเธงเธ”เธเนเธญเธกเธนเธฅเนเธ”เน {selectedDate ? ` (เน€เธเธเธฒเธฐเธงเธฑเธเธ—เธตเน ${selectedDate})` : ""}
                  </div>
                </button>
              </div>
            ) : null}
          </div>

          <Button variant="outline" onClick={() => loadAll(false)} disabled={loading}>
            {loading ? "เธเธณเธฅเธฑเธเนเธซเธฅเธ”..." : "เธฃเธตเน€เธเธฃเธ"}
          </Button>

          {/* โ… user เธเธงเธเธเธธเธกเธเธฑเนเธกเนเธ”เน (เธ–เนเธฒเธญเธขเธฒเธเธเธณเธเธฑเธ”เธชเธดเธ—เธเธด เนเธซเนเธเธญเธกเน€เธกเธเธ•เน 2 เธเธธเนเธกเธเธตเนเธญเธญเธ) */}
          <Button onClick={() => sendPump("ON")} disabled={pumpBusy}>
            {pumpBusy ? "เธเธณเธฅเธฑเธเธชเนเธ..." : "เน€เธฃเธดเนเธกเธฃเธ”เธเนเธณ"}
          </Button>
          <Button variant="danger" onClick={() => sendPump("OFF")} disabled={pumpBusy}>
            {pumpBusy ? "เธเธณเธฅเธฑเธเธชเนเธ..." : "เธซเธขเธธเธ”เธฃเธ”เธเนเธณ"}
          </Button>
        </div>
      </div>

      <Modal
        open={openChartPicker}
        onClose={() => setOpenChartPicker(false)}
        title="เน€เธฅเธทเธญเธเธเธฃเธฒเธเธ—เธตเนเธญเธขเธฒเธเธ”เธน"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-gray-500">เธเธ”เน€เธเธทเนเธญเน€เธเธดเธ”/เธเธดเธ”เธเธฃเธฒเธ เธฃเธฐเธเธเธเธฐเธเธณเนเธงเนเนเธซเน</div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={selectAllCharts}>เน€เธฅเธทเธญเธเธ—เธฑเนเธเธซเธกเธ”</Button>
            <Button variant="outline" onClick={clearCharts}>เธเนเธญเธเธ—เธฑเนเธเธซเธกเธ”</Button>
            <Button variant="outline" onClick={resetCharts}>เธเนเธฒเน€เธฃเธดเนเธกเธ•เนเธ</Button>
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
                {active ? "โ… " : "โ• "}
                {c.label}
              </button>
            );
          })}
        </div>

        <div className="mt-3 text-xs text-gray-500">
          เนเธชเธ”เธเธญเธขเธนเน <b>{visibleCharts.length}</b> / {CHARTS.length} เธเธฃเธฒเธ
        </div>
      </Modal>

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

            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="border rounded-xl px-3 py-2 text-sm bg-white"
              title="เลือกช่วงเวลา"
            >
              <option value="all">ทุกช่วงเวลา</option>
              <option value="1h">ย้อนหลัง 1 ชั่วโมง</option>
              <option value="3h">ย้อนหลัง 3 ชั่วโมง</option>
              <option value="6h">ย้อนหลัง 6 ชั่วโมง</option>
              <option value="12h">ย้อนหลัง 12 ชั่วโมง</option>
              <option value="24h">ย้อนหลัง 24 ชั่วโมง</option>
              <option value="72h">ย้อนหลัง 72 ชั่วโมง</option>
              <option value="custom">กำหนดเอง</option>
            </select>

            {timeRange === "custom" ? (
              <div className="flex flex-wrap gap-2">
                <ClockTimePicker
                  label="เน€เธงเธฅเธฒเน€เธฃเธดเนเธกเธ•เนเธ"
                  value={customFrom}
                  onChange={setCustomFrom}
                />
                <ClockTimePicker
                  label="เน€เธงเธฅเธฒเธชเธดเนเธเธชเธธเธ”"
                  value={customTo}
                  onChange={setCustomTo}
                />
              </div>
            ) : null}

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
              เธงเธฑเธเธเธตเน
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                setSelectedDate("");
                setLockAllDates(true);
                setTimeRange("all");
                setCustomFrom("");
                setCustomTo("");
              }}
            >
              เธฅเนเธฒเธ
            </Button>
          </div>
        </div>

        <div className="mt-3 text-sm text-gray-700">
          {selectedDate ? (
            <>๐“… เธเธณเธฅเธฑเธเนเธชเธ”เธเธเนเธญเธกเธนเธฅเธเธญเธเธงเธฑเธเธ—เธตเน <b>{selectedDate}</b></>
          ) : (
            <>๐“… เธเธณเธฅเธฑเธเนเธชเธ”เธเธเนเธญเธกเธนเธฅเนเธเธเธฃเธงเธก</>
          )}
          {timeRange !== "all" ? (
            timeRange === "custom" ? (
              <>
                {" "}
                | โฑ๏ธ เธเนเธงเธเน€เธงเธฅเธฒ{" "}
                <b>
                  {customFrom || customTo
                    ? `${customFrom || "..."} เธ–เธถเธ ${customTo || "..."}`
                    : "กำหนดเอง"}
                </b>
              </>
            ) : (
              <> | โฑ๏ธ เธเนเธงเธเน€เธงเธฅเธฒ <b>{timeRange.replace("h", " เธเธฑเนเธงเนเธกเธ")}</b></>
            )
          ) : null}
        </div>
      </Card>

      {loading && (
        <Card className="p-5">
          <div className="flex items-center gap-3 text-gray-700">
            <Spinner />
            <div>เธเธณเธฅเธฑเธเนเธซเธฅเธ”เธเนเธญเธกเธนเธฅ...</div>
          </div>
        </Card>
      )}

      {!loading && err && (
        <Card className="p-5 border-red-200 bg-red-50">
          <div className="text-red-700 font-medium">เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”</div>
          <div className="text-red-700 text-sm mt-1">{err}</div>
        </Card>
      )}

      {!loading && !err && (
        <>
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-gray-900">สรุปฟาร์ม</div>
                <div className="text-sm text-gray-500">
                  {farmSummary?.label || `สรุปวันที่ ${selectedDate || todayStr()}`}
                </div>
              </div>
              <Badge variant="blue">ภาพรวมสำคัญ</Badge>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                <div className="text-sm text-blue-700">วันนี้รดน้ำกี่ครั้ง</div>
                <div className="mt-2 text-3xl font-bold text-blue-950">{farmSummary?.summary?.watering_count ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4">
                <div className="text-sm text-cyan-700">พ่นหมอกกี่ครั้ง</div>
                <div className="mt-2 text-3xl font-bold text-cyan-950">{farmSummary?.summary?.mist_count ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                <div className="text-sm text-emerald-700">อุณหภูมิเฉลี่ย</div>
                <div className="mt-2 text-3xl font-bold text-emerald-950">{fmt(farmSummary?.summary?.avg_temperature, 1)}</div>
                <div className="text-xs text-emerald-800">C</div>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                <div className="text-sm text-amber-700">ความชื้นเฉลี่ย</div>
                <div className="mt-2 text-3xl font-bold text-amber-950">{fmt(farmSummary?.summary?.avg_humidity_air, 1)}</div>
                <div className="text-xs text-amber-800">%</div>
              </div>
              <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
                <div className="text-sm text-violet-700">แสงเฉลี่ย</div>
                <div className="mt-2 text-3xl font-bold text-violet-950">{fmt(farmSummary?.summary?.avg_light_lux, 0)}</div>
                <div className="text-xs text-violet-800">lux</div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-semibold text-gray-800 mr-2">เธชเธ–เธฒเธเธฐ:</div>
              {statusBadges.length === 0 ? (
                <Badge variant="gray">เธขเธฑเธเนเธกเนเธกเธตเธเนเธญเธกเธนเธฅเน€เธเธตเธขเธเธเธญ</Badge>
              ) : (
                statusBadges.map((b, idx) => (
                  <Badge key={idx} variant={b.v}>{b.t}</Badge>
                ))
              )}
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <SummaryCard title={<>เธญเธธเธ“เธซเธ เธนเธกเธดเธญเธฒเธเธฒเธจ<div className="text-xs text-gray-500 mt-1">- ยฐC</div></>} value={fmt(latestShow?.temperature, 1)} status={statusTemp(latestShow?.temperature)} />
            <SummaryCard title={<>เธเธงเธฒเธกเธเธทเนเธเธญเธฒเธเธฒเธจ<div className="text-xs text-gray-500 mt-1">- %</div></>} value={fmt(latestShow?.humidity_air, 0)} status={statusRH(latestShow?.humidity_air)} />
            <SummaryCard title={<>เธเธงเธฒเธกเธเธทเนเธเธ”เธดเธ<div className="text-xs text-gray-500 mt-1">- %</div></>} value={fmt(latestShow?.soil_moisture, 0)} status={statusSoil(latestShow?.soil_moisture)} />
            <SummaryCard title={<>เนเธชเธเธ—เธตเนเธเธทเธเนเธ”เนเธฃเธฑเธ<div className="text-xs text-gray-500 mt-1">- lux</div></>} value={fmt(lightLuxValue(latestShow), 0)} status={statusLightLux(lightLuxValue(latestShow))} />

            <SummaryCard title={<>เธเธงเธฒเธกเนเธซเนเธเธเธญเธเธญเธฒเธเธฒเธจ (VPD)<div className="text-xs text-gray-500 mt-1">- kPa</div></>} value={fmt(indexLatestShow?.vpd, 2)} status={statusVPD(indexLatestShow?.vpd)} />
            <SummaryCard title={<>เธเธงเธฒเธกเธฃเนเธญเธเธชเธฐเธชเธก (GDD)<div className="text-xs text-gray-500 mt-1">- ยฐC</div></>} value={fmt(indexLatestShow?.gdd, 2)} status={statusGDD(indexLatestShow?.gdd)} />
            <SummaryCard title={<>เธเธธเธ”เธเนเธณเธเนเธฒเธ<div className="text-xs text-gray-500 mt-1">- ยฐC</div></>} value={fmt(indexLatestShow?.dew_point, 1)} status={statusDewPoint(latestShow?.temperature, indexLatestShow?.dew_point)} />
            <SummaryCard title={<>เธเธงเธฒเธกเน€เธฃเนเธงเธ—เธตเนเธ”เธดเธเนเธซเนเธ<div className="text-xs text-gray-500 mt-1">- %/min</div></>} value={fmt(indexLatestShow?.soil_drying_rate, 3)} status={statusSoilDryingRate(indexLatestShow?.soil_drying_rate)} />
          </div>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold text-gray-900">เธชเธฃเธธเธเธชเธณเธซเธฃเธฑเธเธเธฑเธเธเธธเนเธ</div>
                <div className="text-sm text-gray-500">เธชเธฃเธธเธเธชเธ เธฒเธเนเธงเธ”เธฅเนเธญเธกเนเธเธเน€เธเนเธฒเนเธเธเนเธฒเธข</div>
              </div>
              <Badge variant="blue">เธเธณเนเธเธฐเธเธณ</Badge>
            </div>

            {!latestShow || !indexLatestShow ? (
              <div className="mt-4 text-sm text-gray-500">เธขเธฑเธเนเธกเนเธกเธตเธเนเธญเธกเธนเธฅเธเธญเธชเธณเธซเธฃเธฑเธเธเธฒเธฃเธชเธฃเธธเธ</div>
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
                  เธขเธฑเธเนเธกเนเนเธ”เนเน€เธฅเธทเธญเธเธเธฃเธฒเธเธ—เธตเนเธญเธขเธฒเธเธ”เธน (เธเธ” โ€เน€เธฅเธทเธญเธเธเธฃเธฒเธเธ—เธตเนเธญเธขเธฒเธเธ”เธนโ€ เธ”เนเธฒเธเธเธ)
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
                <div className="text-lg font-semibold text-gray-900">เธเนเธฒเธ•เธฑเนเธเธฃเธฐเธเธเธฃเธ”เธเนเธณ</div>
                <Badge variant="gray">เธ•เธฑเนเธเธเนเธฒ</Badge>
              </div>

              {!settings ? (
                <div className="mt-3 text-sm text-gray-500">
                  เธขเธฑเธเนเธกเนเธกเธตเธเธฒเธฃเธ•เธฑเนเธเธเนเธฒ เธซเธฃเธทเธญเธ”เธถเธเธเนเธญเธกเธนเธฅเนเธกเนเธชเธณเน€เธฃเนเธ (เนเธ•เนเธซเธเนเธฒเธเธตเนเธขเธฑเธเนเธเนเธเธฒเธเนเธ”เน)
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="text-gray-500">เน€เธ•เธทเธญเธเน€เธกเธทเนเธญเธญเธธเธ“เธซเธ เธนเธกเธดเธชเธนเธเธเธงเนเธฒ</div>
                  <div className="font-medium">{tempTh ?? "-"} ยฐC</div>

                  <div className="text-gray-500">เน€เธ•เธทเธญเธเน€เธกเธทเนเธญเธเธงเธฒเธกเธเธทเนเธเธญเธฒเธเธฒเธจเธชเธนเธเธเธงเนเธฒ</div>
                  <div className="font-medium">{rhTh ?? "-"} %</div>

                  <div className="text-gray-500">เน€เธ•เธทเธญเธเน€เธกเธทเนเธญเธ”เธดเธเนเธซเนเธเธ•เนเธณเธเธงเนเธฒ</div>
                  <div className="font-medium">{soilTh ?? "-"} %</div>

                  <div className="text-gray-500">เธเนเธงเธเน€เธงเธฅเธฒเธงเธฑเธ”เธเนเธฒ</div>
                  <div className="font-medium">{samplingMin ?? "-"} เธเธฒเธ—เธต</div>
                </div>
              )}
            </Card>

          </div>

          {!latestShow && filteredSensorHistory.length === 0 && (
            <Card className="p-5 bg-emerald-50 border-emerald-200">
              <div className="font-semibold text-emerald-900">เธขเธฑเธเนเธกเนเธกเธตเธเนเธญเธกเธนเธฅเธเธฒเธเน€เธเธเน€เธเธญเธฃเน</div>
              <div className="text-sm text-emerald-800 mt-1">
                เน€เธกเธทเนเธญเธญเธธเธเธเธฃเธ“เนเธชเนเธเธเนเธญเธกเธนเธฅเน€เธเนเธฒเธกเธฒ เธซเธเนเธฒเธเธตเนเธเธฐเธญเธฑเธเน€เธ”เธ•เน€เธญเธเธ—เธธเธ 5 เธงเธดเธเธฒเธ—เธต
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}




