import { useEffect, useState } from "react";
import api from "../../services/api.js";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Input from "../../components/ui/Input.jsx";
import Spinner from "../../components/ui/Spinner.jsx";
import Badge from "../../components/ui/Badge.jsx";
import { useToast } from "../../components/ui/ToastProvider.jsx";

function dayLabel(d) {
  return ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"][d] || String(d);
}

export default function PumpControl() {
  const toast = useToast();

  const [busy, setBusy] = useState(false);
  const [duration, setDuration] = useState(30);

  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  const [usage, setUsage] = useState([]);
  const [logs, setLogs] = useState([]);

  // load settings + usage + logs
  const loadAll = async () => {
    const [sRes, uRes, cRes] = await Promise.all([
      api.get("/settings/my"),
      api.get("/water-usage?limit=200"),
      api.get("/device/commands?limit=200"),
    ]);
    setSettings(sRes.data || null);
    setUsage(uRes.data || []);
    setLogs(cRes.data || []);
  };

  useEffect(() => {
    loadAll().catch(() => {});
  }, []);

  const sendCommand = async (command) => {
    try {
      setBusy(true);
      await api.post("/device/command", {
        command,
        duration_sec: command === "ON" ? Number(duration || 30) : 0,
        device_id: "pump",
      });
      toast?.push?.({ type: "success", message: `สั่งปั๊ม: ${command}` });
      await loadAll();
    } catch (e) {
      toast?.push?.({ type: "error", message: e?.response?.data?.detail || "สั่งปั๊มไม่สำเร็จ" });
    } finally {
      setBusy(false);
    }
  };

  const updateSetting = (patch) => setSettings((prev) => ({ ...(prev || {}), ...patch }));

  const toggleDay = (idx, d) => {
    const arr = Array.isArray(settings?.watering_schedules?.[idx]?.days)
      ? settings.watering_schedules[idx].days
      : [];
    const next = arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d].sort((a, b) => a - b);

    const nextSchedules = [...(settings?.watering_schedules || [])];
    nextSchedules[idx] = { ...(nextSchedules[idx] || {}), days: next };
    updateSetting({ watering_schedules: nextSchedules });
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      await api.post("/settings/my", settings || {});
      toast?.push?.({ type: "success", message: "บันทึกการตั้งค่าแล้ว" });
      await loadAll();
    } catch (e) {
      toast?.push?.({ type: "error", message: e?.response?.data?.detail || "บันทึกไม่สำเร็จ" });
    } finally {
      setSaving(false);
    }
  };

  const addSchedule = () => {
    const next = [...(settings?.watering_schedules || [])];
    next.push({ enabled: true, time: "06:00", days: [1, 3, 5], duration_sec: 30 });
    updateSetting({ watering_schedules: next });
  };

  const removeSchedule = (idx) => {
    const next = [...(settings?.watering_schedules || [])].filter((_, i) => i !== idx);
    updateSetting({ watering_schedules: next });
  };

  const setScheduleField = (idx, field, value) => {
    const next = [...(settings?.watering_schedules || [])];
    next[idx] = { ...(next[idx] || {}), [field]: value };
    updateSetting({ watering_schedules: next });
  };

  const totalLiters = usage.reduce((s, r) => s + Number(r.liters_est || 0), 0);
  const totalMin = usage.reduce((s, r) => s + Number(r.duration_sec || 0) / 60.0, 0);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">ควบคุมปั๊มน้ำ</div>
            <div className="text-sm text-gray-500">สั่ง ON/OFF และกำหนดเวลา (วินาที)</div>
          </div>

          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-28"
              placeholder="30"
            />
            <Button disabled={busy} onClick={() => sendCommand("ON")}>
              {busy ? <Spinner /> : "เปิด"}
            </Button>
            <Button disabled={busy} variant="danger" onClick={() => sendCommand("OFF")}>
              {busy ? <Spinner /> : "ปิด"}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">ตั้งค่าระบบรดน้ำ</div>
            <div className="text-sm text-gray-500">
              ตั้งอัตราการไหล (เพื่อคำนวณลิตร) และตั้ง schedule (วัน/เวลา)
            </div>
          </div>
          <Button onClick={saveSettings} disabled={saving}>
            {saving ? <Spinner /> : "บันทึก"}
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <div className="text-sm mb-1">device_key (ต้องตรงกับ ESP32)</div>
            <Input
              value={settings?.device_key || ""}
              onChange={(e) => updateSetting({ device_key: e.target.value })}
              placeholder="123456789"
            />
          </div>

          <div>
            <div className="text-sm mb-1">อัตราการไหลปั๊ม (ลิตร/นาที)</div>
            <Input
              type="number"
              value={settings?.pump_flow_rate_lpm ?? 0}
              onChange={(e) => updateSetting({ pump_flow_rate_lpm: Number(e.target.value || 0) })}
              placeholder="0"
            />
          </div>

          <div>
            <div className="text-sm mb-1">sampling_interval_min</div>
            <Input
              type="number"
              value={settings?.sampling_interval_min ?? 5}
              onChange={(e) => updateSetting({ sampling_interval_min: Number(e.target.value || 5) })}
              placeholder="5"
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-2">
          <div className="font-semibold">Schedule (รดน้ำตามวัน/เวลา)</div>
          <Button onClick={addSchedule}>เพิ่ม schedule</Button>
        </div>

        <div className="space-y-3">
          {(settings?.watering_schedules || []).map((s, idx) => (
            <div key={idx} className="border rounded-xl p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!s.enabled}
                    onChange={(e) => setScheduleField(idx, "enabled", e.target.checked)}
                  />
                  <span className="font-semibold">Schedule #{idx + 1}</span>
                  {s.enabled ? <Badge>ON</Badge> : <Badge variant="secondary">OFF</Badge>}
                </div>
                <Button variant="danger" onClick={() => removeSchedule(idx)}>
                  ลบ
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-3 mt-3">
                <div>
                  <div className="text-sm mb-1">เวลา (HH:mm)</div>
                  <Input
                    value={s.time || "06:00"}
                    onChange={(e) => setScheduleField(idx, "time", e.target.value)}
                    placeholder="06:00"
                  />
                </div>

                <div>
                  <div className="text-sm mb-1">ระยะเวลารด (วินาที)</div>
                  <Input
                    type="number"
                    value={s.duration_sec ?? 30}
                    onChange={(e) => setScheduleField(idx, "duration_sec", Number(e.target.value || 30))}
                    placeholder="30"
                  />
                </div>

                <div>
                  <div className="text-sm mb-1">วัน</div>
                  <div className="flex flex-wrap gap-2">
                    {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                      <button
                        key={d}
                        onClick={() => toggleDay(idx, d)}
                        className={`px-3 py-1 rounded-full border text-sm ${
                          (s.days || []).includes(d) ? "bg-black text-white" : "bg-white"
                        }`}
                        type="button"
                      >
                        {dayLabel(d)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">ประวัติการใช้น้ำ</div>
            <div className="text-sm text-gray-500">
              รวม {totalMin.toFixed(1)} นาที / {totalLiters.toFixed(2)} ลิตร (ประมาณ)
            </div>
          </div>
          <Button onClick={loadAll}>รีเฟรช</Button>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">เวลาเริ่ม</th>
                <th className="py-2">ระยะเวลา (วิ)</th>
                <th className="py-2">ลิตร (ประมาณ)</th>
                <th className="py-2">แหล่งคำสั่ง</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((r) => (
                <tr key={r._id} className="border-b">
                  <td className="py-2">{new Date(r.started_at).toLocaleString()}</td>
                  <td className="py-2">{r.duration_sec}</td>
                  <td className="py-2">{Number(r.liters_est || 0).toFixed(2)}</td>
                  <td className="py-2">{r.source}</td>
                </tr>
              ))}
              {usage.length === 0 && (
                <tr>
                  <td className="py-3 text-gray-500" colSpan={4}>
                    ยังไม่มีประวัติ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-lg font-semibold">คำสั่งอุปกรณ์ (ล่าสุด)</div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">เวลา</th>
                <th className="py-2">คำสั่ง</th>
                <th className="py-2">Duration</th>
                <th className="py-2">สถานะ</th>
                <th className="py-2">Source</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((c) => (
                <tr key={c._id} className="border-b">
                  <td className="py-2">{new Date(c.timestamp).toLocaleString()}</td>
                  <td className="py-2">{c.command}</td>
                  <td className="py-2">{c.duration_sec || 0}</td>
                  <td className="py-2">{c.status}</td>
                  <td className="py-2">{c.source}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td className="py-3 text-gray-500" colSpan={5}>
                    ยังไม่มีคำสั่ง
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
