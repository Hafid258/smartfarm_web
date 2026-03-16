import { useEffect, useMemo, useState } from "react";
import api from "../../services/api.js";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Spinner from "../../components/ui/Spinner.jsx";
import Input from "../../components/ui/Input.jsx";
import { useToast } from "../../components/ui/ToastProvider.jsx";

const PAGE_SIZE = 7;

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

function deviceLabel(deviceId) {
  return deviceId === "mist" ? "เครื่องพ่นหมอก" : "ปั๊มน้ำ";
}

function statusLabel(status) {
  if (status === "done") return "สำเร็จ";
  if (status === "failed") return "ไม่สำเร็จ";
  return "รอดำเนินการ";
}

function statusVariant(status) {
  if (status === "done") return "green";
  if (status === "failed") return "red";
  return "gray";
}

function triggerLabel(mode) {
  return mode === "auto" ? "ระบบสั่งเอง" : "สั่งมือ";
}

function triggerVariant(mode) {
  return mode === "auto" ? "yellow" : "blue";
}

function PaginationBar({ page, totalPages, startIndex, endIndex, totalItems, onChange }) {
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1);

  return (
    <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-slate-600">
        แสดงรายการ <span className="font-semibold text-slate-900">{startIndex}-{endIndex}</span> จาก <span className="font-semibold text-slate-900">{totalItems}</span> รายการ
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-cyan-300 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ก่อนหน้า
        </button>

        {pageNumbers.map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            onClick={() => onChange(pageNumber)}
            className={[
              "min-w-[42px] rounded-xl px-3 py-2 text-sm font-semibold transition",
              pageNumber === page
                ? "bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-[0_10px_24px_rgba(16,185,129,0.22)]"
                : "border border-slate-200 bg-white text-slate-700 hover:border-cyan-300 hover:text-cyan-700",
            ].join(" ")}
          >
            {pageNumber}
          </button>
        ))}

        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-cyan-300 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ถัดไป
        </button>
      </div>
    </div>
  );
}

export default function DeviceCommandsLog() {
  const toast = useToast();
  const [farms, setFarms] = useState([]);
  const [farmId, setFarmId] = useState(localStorage.getItem("admin_farmId") || "");
  const [busy, setBusy] = useState(false);
  const [loadingLog, setLoadingLog] = useState(true);
  const [err, setErr] = useState("");
  const [duration, setDuration] = useState(10);
  const [mistDuration, setMistDuration] = useState(10);
  const [logs, setLogs] = useState([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [settings, setSettings] = useState(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [pauseBusy, setPauseBusy] = useState(false);
  const [page, setPage] = useState(1);

  async function loadFarms() {
    const res = await api.get("/farms");
    const list = Array.isArray(res.data) ? res.data : [];
    setFarms(list);
    if (!farmId && list.length) {
      setFarmId(list[0]._id);
      localStorage.setItem("admin_farmId", list[0]._id);
    }
  }

  async function loadLogs() {
    if (!farmId) return;
    setErr("");
    try {
      setLoadingLog(true);
      const [logRes, settingRes] = await Promise.all([
        api.get(`/device/commands?limit=30`),
        api.get(`/settings/my?farm_id=${encodeURIComponent(farmId)}`),
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
    loadFarms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!farmId) return;
    localStorage.setItem("admin_farmId", farmId);
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmId]);

  const availableDates = useMemo(() => {
    const set = new Set();
    logs.forEach((item) => {
      if (!item?.timestamp) return;
      const d = new Date(item.timestamp);
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
    return logs.filter((item) => isSameDay(item.timestamp, selectedDate));
  }, [logs, selectedDate]);

  useEffect(() => {
    setPage(1);
  }, [selectedDate, logs]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startOffset = (currentPage - 1) * PAGE_SIZE;
  const pageLogs = filteredLogs.slice(startOffset, startOffset + PAGE_SIZE);
  const rangeStart = filteredLogs.length === 0 ? 0 : startOffset + 1;
  const rangeEnd = filteredLogs.length === 0 ? 0 : Math.min(startOffset + PAGE_SIZE, filteredLogs.length);

  async function sendCommand(command, deviceId = "pump", customDuration) {
    try {
      setBusy(true);
      const durationValue = command === "ON" ? Number(customDuration ?? duration) || undefined : undefined;
      await api.post("/device/command", {
        command,
        device_id: deviceId,
        duration_sec: durationValue,
      });
      const action = command === "ON" ? "เปิด" : command === "OFF" ? "ปิด" : command;
      toast.success(`สั่งงาน${deviceLabel(deviceId)}สำเร็จ: ${action}`);
      await loadLogs();
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
      await api.post(`/settings/my?farm_id=${encodeURIComponent(farmId)}`, {
        ...settings,
        auto_soil_enabled: next,
      });
      toast.success(next ? "เปิดระบบรดน้ำตามความชื้นแล้ว" : "ปิดระบบรดน้ำตามความชื้นแล้ว");
      await loadLogs();
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
        await api.post(`/settings/my?farm_id=${encodeURIComponent(farmId)}`, {
          ...settings,
          pump_paused: true,
        });
      }
      toast.success("พักปั๊มชั่วคราวแล้ว");
      await loadLogs();
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
        await api.post(`/settings/my?farm_id=${encodeURIComponent(farmId)}`, {
          ...settings,
          pump_paused: false,
        });
      }
      toast.success("สั่งปั๊มทำงานต่อแล้ว");
      await loadLogs();
    } catch (e) {
      toast.error(e.message || "สั่งทำงานต่อไม่สำเร็จ");
    } finally {
      setPauseBusy(false);
    }
  }

  async function cancelAllCommands() {
    try {
      setBusy(true);
      const res = await api.post("/device/commands/cancel-all");
      const canceled = Number(res?.data?.canceled_pending || 0);
      toast.success(`ยกเลิกคิว ${canceled} รายการ และสั่งหยุดปั๊ม/พ่นหมอกแล้ว`);
      await loadLogs();
    } catch (e) {
      toast.error(e.message || "ยกเลิกรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function cancelDeviceCommands(deviceId) {
    try {
      setBusy(true);
      const res = await api.post("/device/commands/cancel-device", {
        device_id: deviceId,
      });
      const canceled = Number(res?.data?.canceled_pending || 0);
      toast.success(`ยกเลิกคิว${deviceLabel(deviceId)} ${canceled} รายการ และสั่งหยุดอุปกรณ์แล้ว`);
      await loadLogs();
    } catch (e) {
      toast.error(e.message || "ยกเลิกรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 text-slate-800">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-2xl font-bold text-gray-900">ควบคุมการรดน้ำ</div>
          <div className="text-sm text-gray-500">สั่งงานปั๊มและดูประวัติการใช้งานของฟาร์มแบบแบ่งหน้าชัดเจน</div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
            value={farmId}
            onChange={(e) => setFarmId(e.target.value)}
          >
            {farms.length === 0 ? <option value="">ไม่มีฟาร์ม</option> : farms.map((farm) => (
              <option key={farm._id} value={farm._id}>{farm.farm_name}</option>
            ))}
          </select>
          <Button variant="outline" onClick={loadLogs} disabled={loadingLog || !farmId}>
            รีเฟรชประวัติ
          </Button>
        </div>
      </div>

      <Card className="p-5">
        <div className="text-lg font-semibold text-gray-900">แผงควบคุมอุปกรณ์</div>
        <div className="mt-1 text-sm text-gray-500">แยกควบคุมปั๊มน้ำและเครื่องพ่นหมอก พร้อมคำสั่งหยุดหรือพักระบบในจุดเดียว</div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 p-4">
            <div className="font-semibold text-gray-900">ปั๊มน้ำ</div>
            <div className="mt-1 text-xs text-gray-500">กำหนดเวลาและสั่งเปิดหรือปิดปั๊มน้ำ</div>

            <div className="mt-3">
              <div className="mb-1 text-sm text-gray-600">เวลารดน้ำต่อครั้ง (วินาที)</div>
              <Input
                type="number"
                min={1}
                max={3600}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="เช่น 10"
              />
              <div className="mt-1 text-xs text-gray-400">ใส่ได้ 1-3600 วินาที</div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button onClick={() => sendCommand("ON")} disabled={busy || !farmId}>
                {busy ? "กำลังส่ง..." : "เริ่มรดน้ำ"}
              </Button>
              <Button variant="danger" onClick={() => sendCommand("OFF")} disabled={busy || !farmId}>
                {busy ? "กำลังส่ง..." : "หยุดรดน้ำ"}
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 p-4">
            <div className="font-semibold text-gray-900">เครื่องพ่นหมอก</div>
            <div className="mt-1 text-xs text-gray-500">กำหนดเวลาและสั่งเปิดหรือปิดพ่นหมอก</div>

            <div className="mt-3">
              <div className="mb-1 text-sm text-gray-600">เวลาพ่นหมอกต่อครั้ง (วินาที)</div>
              <Input
                type="number"
                min={1}
                max={3600}
                value={mistDuration}
                onChange={(e) => setMistDuration(e.target.value)}
                placeholder="เช่น 10"
              />
              <div className="mt-1 text-xs text-gray-400">ใส่ได้ 1-3600 วินาที</div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button onClick={() => sendCommand("ON", "mist", mistDuration)} disabled={busy || !farmId}>
                {busy ? "กำลังส่ง..." : "เปิดพ่นหมอก"}
              </Button>
              <Button variant="danger" onClick={() => sendCommand("OFF", "mist")} disabled={busy || !farmId}>
                {busy ? "กำลังส่ง..." : "ปิดพ่นหมอก"}
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-gray-200 p-4">
          <div className="font-semibold text-gray-900">คำสั่งระบบ</div>
          <div className="mt-1 text-xs text-gray-500">ใช้กรณีต้องพักระบบ หยุดงาน หรือยกเลิกคิวการทำงานที่ยังค้างอยู่</div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 p-3">
              <div className="text-sm font-semibold text-gray-900">ปั๊มน้ำ</div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button variant="outline" onClick={pausePump} disabled={pauseBusy || !farmId}>
                  {pauseBusy ? "กำลังส่ง..." : "พักระบบรดน้ำ"}
                </Button>
                <Button variant="outline" onClick={resumePump} disabled={pauseBusy || !farmId}>
                  {pauseBusy ? "กำลังส่ง..." : "ทำงานต่อ"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => cancelDeviceCommands("pump")}
                  disabled={busy || !farmId}
                  className="sm:col-span-2"
                >
                  {busy ? "กำลังส่ง..." : "ยกเลิกคิวปั๊มน้ำ"}
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-3">
              <div className="text-sm font-semibold text-gray-900">เครื่องพ่นหมอก</div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button variant="outline" onClick={() => sendCommand("PAUSE", "mist")} disabled={busy || !farmId}>
                  {busy ? "กำลังส่ง..." : "พักระบบพ่นหมอก"}
                </Button>
                <Button variant="outline" onClick={() => sendCommand("RESUME", "mist")} disabled={busy || !farmId}>
                  {busy ? "กำลังส่ง..." : "ทำงานต่อ"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => cancelDeviceCommands("mist")}
                  disabled={busy || !farmId}
                  className="sm:col-span-2"
                >
                  {busy ? "กำลังส่ง..." : "ยกเลิกคิวพ่นหมอก"}
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-3">
            <Button variant="outline" onClick={cancelAllCommands} disabled={busy || !farmId} className="w-full sm:w-auto">
              {busy ? "กำลังส่ง..." : "ยกเลิกทั้งหมด (ทุกอุปกรณ์)"}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-gray-900">ประวัติการใช้ปั๊มน้ำและคำสั่งระบบ</div>
            <div className="mt-1 text-sm text-gray-500">แสดงครั้งละ 7 รายการ พร้อมลำดับหน้าเพื่อย้อนดูย้อนหลังได้ง่าย</div>
          </div>
          <Badge variant="gray">บันทึกการใช้งาน</Badge>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={toggleAutoSoil} disabled={autoBusy || !settings}>
            {autoBusy
              ? "กำลังอัปเดต..."
              : settings?.auto_soil_enabled
                ? "ปิดรดน้ำอัตโนมัติ (ตามความชื้นดิน)"
                : "เปิดรดน้ำอัตโนมัติ (ตามความชื้นดิน)"}
          </Button>
          {settings?.pump_paused ? <Badge variant="yellow">ปั๊มถูกพักชั่วคราว</Badge> : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
            title="เลือกวันที่"
          >
            <option value="">แสดงทั้งหมด</option>
            {availableDates.map((date) => (
              <option key={date} value={date}>
                {date}
              </option>
            ))}
          </select>

          <Button
            variant="outline"
            onClick={() => {
              const today = todayStr();
              if (availableDates.includes(today)) setSelectedDate(today);
            }}
          >
            วันนี้
          </Button>

          <Button variant="outline" onClick={() => setSelectedDate("")}>
            ล้าง
          </Button>
        </div>

        {loadingLog ? (
          <div className="mt-4 flex items-center gap-2 text-gray-600">
            <Spinner />
            <div>กำลังโหลด...</div>
          </div>
        ) : null}

        {!loadingLog && err ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {err}
          </div>
        ) : null}

        {!loadingLog && !err && filteredLogs.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-sm text-gray-500">
            ยังไม่มีประวัติคำสั่ง
          </div>
        ) : null}

        {!loadingLog && !err && filteredLogs.length > 0 ? (
          <>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200/80">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-gray-500">
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-3 pr-4">เวลา</th>
                    <th className="px-4 py-3 pr-4">อุปกรณ์</th>
                    <th className="px-4 py-3 pr-4">คำสั่ง</th>
                    <th className="px-4 py-3 pr-4">ใครเป็นคนสั่ง</th>
                    <th className="px-4 py-3 pr-4">ประเภท</th>
                    <th className="px-4 py-3 pr-4">ระยะเวลา</th>
                    <th className="px-4 py-3 pr-4">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {pageLogs.map((log) => (
                    <tr key={log._id} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-4 py-3 pr-4 text-gray-700">{log.timestamp ? new Date(log.timestamp).toLocaleString() : "-"}</td>
                      <td className="px-4 py-3 pr-4 text-gray-700">{deviceLabel(log.device_id || "pump")}</td>
                      <td className="px-4 py-3 pr-4">
                        <Badge variant={log.command === "ON" ? "green" : log.command === "OFF" ? "red" : "blue"}>
                          {log.command || "-"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 pr-4 text-gray-700">{log.actor_name || "-"}</td>
                      <td className="px-4 py-3 pr-4">
                        <Badge variant={triggerVariant(log.trigger_mode)}>{triggerLabel(log.trigger_mode)}</Badge>
                      </td>
                      <td className="px-4 py-3 pr-4 text-gray-700">{log.duration_sec ?? "-"}</td>
                      <td className="px-4 py-3 pr-4">
                        <Badge variant={statusVariant(log.status)}>{statusLabel(log.status)}</Badge>
                        {log.error_message ? <div className="mt-1 text-xs text-red-600">{log.error_message}</div> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <PaginationBar
              page={currentPage}
              totalPages={totalPages}
              startIndex={rangeStart}
              endIndex={rangeEnd}
              totalItems={filteredLogs.length}
              onChange={setPage}
            />
          </>
        ) : null}
      </Card>
    </div>
  );
}
