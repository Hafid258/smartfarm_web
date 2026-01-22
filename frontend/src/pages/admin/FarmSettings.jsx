import { useEffect, useState } from "react";
import api from "../../services/api.js";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Input from "../../components/ui/Input.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Spinner from "../../components/ui/Spinner.jsx";
import { useToast } from "../../components/ui/ToastProvider.jsx";

function clampNum(v, min, max, fallback) {
  const n = Number(v);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const WEEK_DAYS = [
  { value: 1, label: "จันทร์" },
  { value: 2, label: "อังคาร" },
  { value: 3, label: "พุธ" },
  { value: 4, label: "พฤหัสฯ" },
  { value: 5, label: "ศุกร์" },
  { value: 6, label: "เสาร์" },
  { value: 0, label: "อาทิตย์" },
];

function normalizeSchedules(settings) {
  if (Array.isArray(settings?.watering_schedules) && settings.watering_schedules.length) {
    return settings.watering_schedules.map((s) => ({
      enabled: Boolean(s.enabled),
      time: s.time || "06:00",
      days: Array.isArray(s.days) ? s.days : [],
    }));
  }

  if (settings?.watering_schedule_time || settings?.watering_schedule_days?.length) {
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

export default function FarmSettings() {
  const toast = useToast();
  const [farms, setFarms] = useState([]);
  const [farmId, setFarmId] = useState(localStorage.getItem("admin_farmId") || "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [form, setForm] = useState({
    sampling_interval_min: 5,
    watering_duration_sec: 10,
    watering_cooldown_min: 10,
    watering_schedules: [],
  });

  async function loadFarms() {
    const res = await api.get("/admin/farms");
    const list = Array.isArray(res.data) ? res.data : [];
    setFarms(list);
    if (!farmId && list.length) {
      setFarmId(list[0]._id);
      localStorage.setItem("admin_farmId", list[0]._id);
    }
  }

  async function loadSettings(fid) {
    if (!fid) return;
    setErr("");
    try {
      setLoading(true);
      const res = await api.get(`/settings/my?farm_id=${encodeURIComponent(fid)}`);
      const s = res.data;
      if (s) {
        setForm({
          sampling_interval_min: s.sampling_interval_min ?? 5,
          watering_duration_sec: s.watering_duration_sec ?? 10,
          watering_cooldown_min: s.watering_cooldown_min ?? 10,
          watering_schedules: normalizeSchedules(s),
        });
      }
    } catch (e) {
      setErr(e.message || "โหลดตั้งค่าไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFarms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!farmId) return;
    localStorage.setItem("admin_farmId", farmId);
    loadSettings(farmId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmId]);

  async function save() {
    if (!farmId) return toast.error("กรุณาเลือกฟาร์ม");
    try {
      setSaving(true);
      const payload = {
        sampling_interval_min: clampNum(form.sampling_interval_min, 1, 1440, 5),
        watering_duration_sec: clampNum(form.watering_duration_sec, 1, 3600, 10),
        watering_cooldown_min: clampNum(form.watering_cooldown_min, 0, 1440, 10),
        watering_schedules: form.watering_schedules,
      };

      await api.post(`/settings/my?farm_id=${encodeURIComponent(farmId)}`, payload);
      toast.success("บันทึกสำเร็จ");
      await loadSettings(farmId);
    } catch (e) {
      toast.error(e.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-2xl font-bold text-gray-900">Farm Settings</div>
          <div className="text-sm text-gray-500">ปรับ settings ต่อฟาร์ม (admin override)</div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <select
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
            value={farmId}
            onChange={(e) => setFarmId(e.target.value)}
          >
            {farms.length === 0 ? <option value="">No farms</option> : farms.map((f) => (
              <option key={f._id} value={f._id}>{f.farm_name}</option>
            ))}
          </select>

          <Button onClick={save} disabled={saving || loading || !farmId}>
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </div>
      </div>

      <Card className="p-5">
        {loading && (
          <div className="flex items-center gap-2 text-gray-600">
            <Spinner />
            <div>กำลังโหลด...</div>
          </div>
        )}

        {!loading && err && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
        )}

        {!loading && !err && (
          <div className="space-y-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold text-gray-900">Automation</div>
                <Badge variant="blue">advanced</Badge>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-600 mb-1">Sampling Interval (นาที)</div>
                  <Input
                    type="number"
                    value={form.sampling_interval_min}
                    onChange={(e) => setForm((p) => ({ ...p, sampling_interval_min: e.target.value }))}
                  />
                </div>

                <div>
                  <div className="text-sm text-gray-600 mb-1">Watering Duration (วินาที)</div>
                  <Input
                    type="number"
                    value={form.watering_duration_sec}
                    onChange={(e) => setForm((p) => ({ ...p, watering_duration_sec: e.target.value }))}
                  />
                </div>

                <div>
                  <div className="text-sm text-gray-600 mb-1">Watering Cooldown (นาที)</div>
                  <Input
                    type="number"
                    value={form.watering_cooldown_min}
                    onChange={(e) => setForm((p) => ({ ...p, watering_cooldown_min: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">ตั้งเวลารดน้ำอัตโนมัติ</div>
                <Button variant="outline" onClick={() => setForm((p) => ({
                  ...p,
                  watering_schedules: [
                    ...(Array.isArray(p.watering_schedules) ? p.watering_schedules : []),
                    { enabled: true, time: "06:00", days: [] },
                  ],
                }))}>
                  + เพิ่มเวลา
                </Button>
              </div>

              {form.watering_schedules.length === 0 ? (
                <div className="text-sm text-gray-500">ยังไม่มีการตั้งเวลา</div>
              ) : (
                <div className="space-y-4">
                  {form.watering_schedules.map((s, idx) => (
                    <div key={idx} className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={Boolean(s.enabled)}
                            onChange={(e) =>
                              setForm((p) => {
                                const current = Array.isArray(p.watering_schedules)
                                  ? p.watering_schedules
                                  : [];
                                const updated = current.map((x, i) =>
                                  i === idx ? { ...x, enabled: e.target.checked } : x
                                );
                                return { ...p, watering_schedules: updated };
                              })
                            }
                          />
                          เปิดใช้งาน
                        </div>
                        <Button
                          variant="outline"
                          onClick={() =>
                            setForm((p) => {
                              const current = Array.isArray(p.watering_schedules)
                                ? p.watering_schedules
                                : [];
                              return { ...p, watering_schedules: current.filter((_, i) => i !== idx) };
                            })
                          }
                        >
                          ลบ
                        </Button>
                      </div>

                      <div>
                        <div className="text-sm text-gray-600 mb-1">เวลา (HH:mm)</div>
                        <Input
                          type="time"
                          value={s.time || "06:00"}
                          onChange={(e) =>
                            setForm((p) => {
                              const current = Array.isArray(p.watering_schedules)
                                ? p.watering_schedules
                                : [];
                              const updated = current.map((x, i) =>
                                i === idx ? { ...x, time: e.target.value } : x
                              );
                              return { ...p, watering_schedules: updated };
                            })
                          }
                        />
                      </div>

                      <div>
                        <div className="text-sm text-gray-600 mb-2">วันที่ต้องการรดน้ำ</div>
                        <div className="flex flex-wrap gap-2">
                          {WEEK_DAYS.map((d) => {
                            const active = Array.isArray(s.days) && s.days.includes(d.value);
                            return (
                              <button
                                key={d.value}
                                type="button"
                                onClick={() =>
                                  setForm((p) => {
                                    const current = Array.isArray(p.watering_schedules)
                                      ? p.watering_schedules
                                      : [];
                                    const item = current[idx];
                                    if (!item) return p;
                                    const days = Array.isArray(item.days) ? item.days : [];
                                    const nextDays = days.includes(d.value)
                                      ? days.filter((x) => x !== d.value)
                                      : [...days, d.value];
                                    const updated = current.map((x, i) =>
                                      i === idx ? { ...x, days: nextDays } : x
                                    );
                                    return { ...p, watering_schedules: updated };
                                  })
                                }
                                className={`px-3 py-2 rounded-xl text-xs border transition ${
                                  active
                                    ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                                }`}
                              >
                                {active ? "✅ " : "➕ "}
                                {d.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
