import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../services/api.js";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import Badge from "../ui/Badge.jsx";
import Spinner from "../ui/Spinner.jsx";
import { useToast } from "../ui/ToastProvider.jsx";
import { exportReportExcel, exportReportPdf } from "../../utils/reportExport.js";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function thisMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

function fmt(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "-";
  return Number(n).toFixed(digits);
}

function statusTemp(temp) {
  if (temp === null || temp === undefined || Number.isNaN(Number(temp))) return "normal";
  const t = Number(temp);
  if (t > 35) return "danger";
  if (t >= 32) return "warning";
  return "good";
}

function statusRH(rh) {
  if (rh === null || rh === undefined || Number.isNaN(Number(rh))) return "normal";
  const r = Number(rh);
  if (r > 90 || r < 40) return "warning";
  return "good";
}

function statusLightLux(lightLux) {
  if (lightLux === null || lightLux === undefined || Number.isNaN(Number(lightLux))) return "normal";
  const lux = Number(lightLux);
  if (lux < 2000) return "danger";
  if (lux < 4000) return "warning";
  return "good";
}

const STATUS_STYLES = {
  good: {
    card: "border-emerald-100 bg-emerald-50/70",
    label: "text-emerald-700",
    value: "text-emerald-950",
    unit: "text-emerald-800",
    badge: "border-emerald-200 bg-emerald-100 text-emerald-800",
    text: "เหมาะสม",
  },
  warning: {
    card: "border-amber-100 bg-amber-50/80",
    label: "text-amber-700",
    value: "text-amber-950",
    unit: "text-amber-800",
    badge: "border-amber-200 bg-amber-100 text-amber-800",
    text: "เสี่ยงปานกลาง",
  },
  danger: {
    card: "border-red-100 bg-red-50/80",
    label: "text-red-700",
    value: "text-red-950",
    unit: "text-red-800",
    badge: "border-red-200 bg-red-100 text-red-800",
    text: "เสี่ยงสูง",
  },
  normal: {
    card: "border-slate-100 bg-slate-50/80",
    label: "text-slate-600",
    value: "text-slate-900",
    unit: "text-slate-700",
    badge: "border-slate-200 bg-slate-100 text-slate-700",
    text: "ไม่มีข้อมูล",
  },
};

function ReportStatusCard({ title, value, unit, status }) {
  const tone = STATUS_STYLES[status] || STATUS_STYLES.normal;

  return (
    <Card className={`p-4 ${tone.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div className={`text-sm ${tone.label}`}>{title}</div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone.badge}`}>
          {tone.text}
        </span>
      </div>
      <div className={`mt-2 text-3xl font-bold ${tone.value}`}>{value}</div>
      <div className={`text-xs ${tone.unit}`}>{unit}</div>
    </Card>
  );
}

export default function ReportsView({ adminMode = false }) {
  const toast = useToast();
  const [farms, setFarms] = useState([]);
  const [farmId, setFarmId] = useState(adminMode ? (localStorage.getItem("admin_farmId") || "") : "");
  const [period, setPeriod] = useState("day");
  const [date, setDate] = useState(todayStr());
  const [month, setMonth] = useState(thisMonthStr());
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [err, setErr] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams({ period });
    if (adminMode && farmId) params.set("farm_id", farmId);
    if (period === "month") params.set("month", month);
    else params.set("date", date);
    return params.toString();
  }, [adminMode, farmId, period, date, month]);

  const activeFarmName = useMemo(() => {
    if (!adminMode) return "ฟาร์มของฉัน";
    return farms.find((f) => String(f._id) === String(farmId))?.farm_name || "ฟาร์ม";
  }, [adminMode, farms, farmId]);

  const avgTempStatus = statusTemp(report?.summary?.avg_temperature);
  const avgHumidityStatus = statusRH(report?.summary?.avg_humidity_air);
  const avgLightStatus = statusLightLux(report?.summary?.avg_light_lux);

  const loadFarms = useCallback(async () => {
    if (!adminMode) return;
    const res = await api.get("/farms");
    const list = Array.isArray(res.data) ? res.data : [];
    setFarms(list);
    if (!farmId && list[0]?._id) {
      setFarmId(list[0]._id);
      localStorage.setItem("admin_farmId", list[0]._id);
    }
  }, [adminMode, farmId]);

  const loadReport = useCallback(async () => {
    if (adminMode && !farmId) return;
    setLoading(true);
    setErr("");
    try {
      const res = await api.get(`/dashboard/report?${query}`);
      setReport(res.data || null);
    } catch (e) {
      setErr(e.message || "โหลดรายงานไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [adminMode, farmId, query]);

  useEffect(() => {
    loadFarms();
  }, [loadFarms]);

  useEffect(() => {
    if (adminMode && !farmId) return;
    if (adminMode && farmId) localStorage.setItem("admin_farmId", farmId);
    loadReport();
  }, [adminMode, farmId, loadReport]);

  function handleExportExcel() {
    exportReportExcel(report, period);
  }

  function handleExportPdf() {
    const ok = exportReportPdf(report, { farmName: activeFarmName, period });
    if (!ok) toast.error("เปิดหน้าต่าง PDF ไม่ได้");
  }

  return (
    <div className="space-y-5 text-slate-800">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-2xl font-bold text-gray-900">หน้ารายงาน</div>
          <div className="text-sm text-gray-500">ดูรายวัน รายสัปดาห์ รายเดือน และส่งออกเป็น PDF/Excel</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExportPdf} disabled={!report}>ส่งออก PDF</Button>
          <Button onClick={handleExportExcel} disabled={!report}>ส่งออก Excel</Button>
        </div>
      </div>

      <Card className="p-5">
        <div className={`grid gap-3 ${adminMode ? "lg:grid-cols-[1fr_180px_180px_auto]" : "lg:grid-cols-[180px_180px_auto]"}`}>
          {adminMode ? (
            <select className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm" value={farmId} onChange={(e) => setFarmId(e.target.value)}>
              {farms.map((f) => <option key={f._id} value={f._id}>{f.farm_name}</option>)}
            </select>
          ) : null}
          <select className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="day">รายวัน</option>
            <option value="week">รายสัปดาห์</option>
            <option value="month">รายเดือน</option>
          </select>
          {period === "month" ? (
            <input className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          ) : (
            <input className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          )}
          <Button variant="outline" onClick={loadReport}>รีเฟรช</Button>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-600"><Spinner /> กำลังโหลดรายงาน...</div>
      ) : err ? (
        <Card className="border border-red-200 bg-red-50 p-5 text-red-700">{err}</Card>
      ) : report ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Card className="p-4"><div className="text-sm text-gray-500">รดน้ำ</div><div className="mt-2 text-3xl font-bold">{report.summary?.watering_count ?? 0}</div><div className="text-xs text-gray-500">ครั้ง</div></Card>
            <Card className="p-4"><div className="text-sm text-gray-500">พ่นหมอก</div><div className="mt-2 text-3xl font-bold">{report.summary?.mist_count ?? 0}</div><div className="text-xs text-gray-500">ครั้ง</div></Card>
            <ReportStatusCard
              title="อุณหภูมิเฉลี่ย"
              value={fmt(report.summary?.avg_temperature, 1)}
              unit="°C"
              status={avgTempStatus}
            />
            <ReportStatusCard
              title="ความชื้นเฉลี่ย"
              value={fmt(report.summary?.avg_humidity_air, 1)}
              unit="%"
              status={avgHumidityStatus}
            />
            <ReportStatusCard
              title="แสงเฉลี่ย"
              value={fmt(report.summary?.avg_light_lux, 0)}
              unit="lux"
              status={avgLightStatus}
            />
          </div>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold text-gray-900">สรุปการสั่งงาน</div>
                <div className="text-sm text-gray-500">แยกตามอุปกรณ์ คำสั่ง และระบบสั่งเอง/สั่งมือ</div>
              </div>
              <Badge variant="blue">{report.label}</Badge>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-gray-500">
                  <tr className="border-b">
                    <th className="py-2 pr-4">ประเภท</th>
                    <th className="py-2 pr-4">แหล่งที่มา</th>
                    <th className="py-2 pr-4">อุปกรณ์</th>
                    <th className="py-2 pr-4">คำสั่ง</th>
                    <th className="py-2 pr-4">จำนวน</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.command_breakdown || []).map((row, idx) => (
                    <tr key={`${row.source}-${row.device_id}-${row.command}-${idx}`} className="border-b last:border-b-0">
                      <td className="py-2 pr-4">{row.trigger_mode === "auto" ? "ระบบสั่งเอง" : "สั่งมือ"}</td>
                      <td className="py-2 pr-4">{row.source}</td>
                      <td className="py-2 pr-4">{row.device_id}</td>
                      <td className="py-2 pr-4">{row.command}</td>
                      <td className="py-2 pr-4">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-lg font-semibold text-gray-900">ประวัติคำสั่งล่าสุด</div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-gray-500">
                  <tr className="border-b">
                    <th className="py-2 pr-4">เวลา</th>
                    <th className="py-2 pr-4">อุปกรณ์</th>
                    <th className="py-2 pr-4">คำสั่ง</th>
                    <th className="py-2 pr-4">ใครเป็นคนสั่ง</th>
                    <th className="py-2 pr-4">ประเภท</th>
                    <th className="py-2 pr-4">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.commands || []).map((row) => (
                    <tr key={row._id} className="border-b last:border-b-0">
                      <td className="py-2 pr-4">{row.timestamp ? new Date(row.timestamp).toLocaleString() : "-"}</td>
                      <td className="py-2 pr-4">{row.device_id || "-"}</td>
                      <td className="py-2 pr-4">{row.command || "-"}</td>
                      <td className="py-2 pr-4">{row.actor_name || "-"}</td>
                      <td className="py-2 pr-4">{row.trigger_mode === "auto" ? "ระบบสั่งเอง" : "สั่งมือ"}</td>
                      <td className="py-2 pr-4">{row.status || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}

