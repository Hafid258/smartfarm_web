import { useEffect, useMemo, useState } from "react";
import api from "../../services/api.js";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Spinner from "../../components/ui/Spinner.jsx";
import Input from "../../components/ui/Input.jsx";
import { useToast } from "../../components/ui/ToastProvider.jsx";

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

export default function ControlPump() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [loadingLog, setLoadingLog] = useState(true);
  const [err, setErr] = useState("");

  const [duration, setDuration] = useState(10); // seconds
  const [logs, setLogs] = useState([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [settings, setSettings] = useState(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [pauseBusy, setPauseBusy] = useState(false);

  async function loadAll() {
    setErr("");
    try {
      setLoadingLog(true);
      const [logRes, settingRes] = await Promise.all([
        api.get("/device/commands?limit=30"),
        api.get("/settings/my"),
      ]);
      setLogs(Array.isArray(logRes.data) ? logRes.data : []);
      setSettings(settingRes.data || null);
    } catch (e) {
      setErr(e.message || "โหลดประวัติคำสั่งไม่สำเร็จ");
    } finally {
      setLoadingLog(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const availableDates = useMemo(() => {
    const set = new Set();
    logs.forEach((x) => {
      if (!x?.timestamp) return;
      const d = new Date(x.timestamp);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      set.add(`${yyyy}-${mm}-${dd}`);
    });
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [logs]);

  useEffect(() => {
    if (!selectedDate) return;
    if (!availableDates.includes(selectedDate)) setSelectedDate("");
  }, [availableDates, selectedDate]);

  const filteredLogs = useMemo(() => {
    if (!selectedDate) return logs;
    return logs.filter((x) => isSameDay(x.timestamp, selectedDate));
  }, [logs, selectedDate]);

  async function sendCommand(command) {
    try {
      setBusy(true);
      await api.post("/device/command", {
        command,
        duration_sec: Number(duration) || undefined,
      });
      const action = command === "ON" ? "เริ่มรดน้ำ" : command === "OFF" ? "หยุดรดน้ำ" : command;
      toast.success(`สั่งงานปั๊มสำเร็จ: ${action}`);
      await loadAll();
    } catch (e) {
      toast.error(e.message || "ส่งคำสั่งไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAutoSoil() {
    try {
      if (!settings) return;
      setAutoBusy(true);
      const next = !settings.auto_soil_enabled;
      const payload = {
        ...settings,
        auto_soil_enabled: next,
      };
      await api.post("/settings/my", payload);
      toast.success(next ? "เปิดระบบรดน้ำตามความชื้นแล้ว" : "ปิดระบบรดน้ำตามความชื้นแล้ว");
      await loadAll();
    } catch (e) {
      toast.error(e.message || "อัปเดตไม่สำเร็จ");
    } finally {
      setAutoBusy(false);
    }
  }

  async function pausePump() {
    try {
      setPauseBusy(true);
      await api.post("/device/command", { command: "PAUSE" });
      if (settings) {
        await api.post("/settings/my", { ...settings, pump_paused: true });
      }
      toast.success("พักปั๊มชั่วคราวแล้ว");
      await loadAll();
    } catch (e) {
      toast.error(e.message || "พักปั๊มไม่สำเร็จ");
    } finally {
      setPauseBusy(false);
    }
  }

  async function resumePump() {
    try {
      setPauseBusy(true);
      await api.post("/device/command", { command: "RESUME" });
      if (settings) {
        await api.post("/settings/my", { ...settings, pump_paused: false });
      }
      toast.success("สั่งปั๊มทำงานต่อแล้ว");
      await loadAll();
    } catch (e) {
      toast.error(e.message || "สั่งต่อไม่สำเร็จ");
    } finally {
      setPauseBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-2xl font-bold text-gray-900">ควบคุมการรดน้ำ</div>
          <div className="text-sm text-gray-500">สั่งรดน้ำผักบุ้ง และดูประวัติการรดน้ำ</div>
        </div>
        <Button variant="outline" onClick={loadAll} disabled={loadingLog}>
          รีเฟรชประวัติ
        </Button>
      </div>

      <Card className="p-5">
        <div className="flex flex-col lg:flex-row gap-5 lg:items-end lg:justify-between">
          <div className="flex-1">
            <div className="text-lg font-semibold text-gray-900">สั่งปั๊มรดน้ำ</div>
            <div className="text-sm text-gray-500 mt-1">
              ระบบจะบันทึกคำสั่งไว้ในฐานข้อมูลเพื่อดูย้อนหลัง
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-sm text-gray-600 mb-1">เวลารดน้ำต่อครั้ง (วินาที)</div>
                <Input
                  type="number"
                  min={1}
                  max={3600}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="เช่น 10"
                />
                <div className="text-xs text-gray-400 mt-1">ใส่ได้ 1–3600 วินาที</div>
              </div>

              <div className="flex gap-2 sm:justify-end sm:items-end">
                <Button onClick={() => sendCommand("ON")} disabled={busy} className="w-full sm:w-auto">
                  {busy ? "กำลังส่ง..." : "เริ่มรดน้ำ"}
                </Button>
                <Button variant="danger" onClick={() => sendCommand("OFF")} disabled={busy} className="w-full sm:w-auto">
                  {busy ? "กำลังส่ง..." : "หยุดรดน้ำ"}
                </Button>
                <Button variant="outline" onClick={pausePump} disabled={pauseBusy} className="w-full sm:w-auto">
                  {pauseBusy ? "กำลังส่ง..." : "พักระบบรดน้ำ"}
                </Button>
                <Button variant="outline" onClick={resumePump} disabled={pauseBusy} className="w-full sm:w-auto">
                  {pauseBusy ? "กำลังส่ง..." : "ทำงานต่อ"}
                </Button>
              </div>
            </div>
          </div>

          <div className="lg:w-[360px]">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="font-semibold text-emerald-900">คำแนะนำสำหรับผักบุ้ง</div>
              <ul className="mt-2 text-sm text-emerald-800 list-disc pl-5 space-y-1">
                <li>ผักบุ้งชอบดินชื้นสม่ำเสมอ แนะนำรดเป็นช่วงสั้น ๆ แต่ต่อเนื่อง</li>
                <li>หากดินชื้นมากให้เว้นช่วงรดน้ำเพื่อกันน้ำขัง</li>
                <li>ดูประวัติการรดน้ำด้านล่างได้เลย</li>
              </ul>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold text-gray-900">ประวัติการรดน้ำ</div>
          <Badge variant="gray">บันทึกการรดน้ำ</Badge>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 items-center">
          <Button variant="outline" onClick={toggleAutoSoil} disabled={autoBusy || !settings}>
            {autoBusy
              ? "กำลังอัปเดต..."
              : settings?.auto_soil_enabled
                ? "ปิดรดน้ำอัตโนมัติ (ตามความชื้นดิน)"
                : "เปิดรดน้ำอัตโนมัติ (ตามความชื้นดิน)"}
          </Button>
          {settings?.pump_paused ? <Badge variant="yellow">ปั๊มถูกพักชั่วคราว</Badge> : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 items-center">
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border rounded-xl px-3 py-2 text-sm bg-white"
            title="เลือกวันที่"
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
              if (availableDates.includes(t)) setSelectedDate(t);
            }}
          >
            วันนี้
          </Button>

          <Button variant="outline" onClick={() => setSelectedDate("")}>
            ล้าง
          </Button>
        </div>

        {loadingLog && (
          <div className="mt-4 flex items-center gap-2 text-gray-600">
            <Spinner />
            <div>กำลังโหลด...</div>
          </div>
        )}

        {!loadingLog && err && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {err}
          </div>
        )}

        {!loadingLog && !err && filteredLogs.length === 0 && (
          <div className="mt-4 text-sm text-gray-500">ยังไม่มีประวัติคำสั่ง</div>
        )}

        {!loadingLog && !err && filteredLogs.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-gray-500">
                <tr className="border-b">
                  <th className="py-2 pr-4">เวลา</th>
                  <th className="py-2 pr-4">อุปกรณ์</th>
                  <th className="py-2 pr-4">คำสั่ง</th>
                  <th className="py-2 pr-4">ระยะเวลา</th>
                  <th className="py-2 pr-4">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((l) => (
                  <tr key={l._id} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 text-gray-700">
                      {l.timestamp ? new Date(l.timestamp).toLocaleString() : "-"}
                    </td>
                    <td className="py-2 pr-4 text-gray-700">{l.device_id || "pump"}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={l.command === "ON" ? "green" : "red"}>{l.command || "-"}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-gray-700">{l.duration_sec ?? "-"}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={l.status === "success" ? "green" : l.status === "fail" ? "red" : "gray"}>
                        {l.status || "unknown"}
                      </Badge>
                      {l.error_message ? (
                        <div className="text-xs text-red-600 mt-1">{l.error_message}</div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
