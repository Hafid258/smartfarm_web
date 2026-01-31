import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../services/api.js";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Input from "../../components/ui/Input.jsx";
import Spinner from "../../components/ui/Spinner.jsx";
import Badge from "../../components/ui/Badge.jsx";
import { useToast } from "../../components/ui/ToastProvider.jsx";

const METRICS = [
  { value: "temperature", label: "อุณหภูมิ (°C)" },
  { value: "humidity_air", label: "ความชื้นอากาศ (%)" },
  { value: "soil_moisture", label: "ความชื้นดิน (%)" },
  { value: "vpd", label: "VPD (kPa)" },
  { value: "gdd", label: "GDD (°C)" },
  { value: "dew_point", label: "จุดน้ำค้าง (°C)" },
  { value: "soil_drying_rate", label: "อัตราดินแห้ง (%/min)" },
];

const OPERATOR_LABEL = {
  lt: "ต่ำกว่า (<)",
  gt: "สูงกว่า (>)",
};

function metricLabel(metric) {
  return METRICS.find((m) => m.value === metric)?.label || metric;
}

export default function AlertRules() {
  const toast = useToast();

  const [farms, setFarms] = useState([]);
  const [farmId, setFarmId] = useState(localStorage.getItem("admin_farmId") || "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [rules, setRules] = useState([]);

  // ✅ ฟอร์มสร้าง rule
  const [metric, setMetric] = useState("temperature");
  const [operator, setOperator] = useState("gt");
  const [threshold, setThreshold] = useState("");
  const [message, setMessage] = useState("");
  const [actionWater, setActionWater] = useState(false);
  const [actionDuration, setActionDuration] = useState(30);

  // ✅ แก้ไข rule
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const loadFarms = useCallback(async () => {
    try {
      const res = await api.get("/farms");
      const list = Array.isArray(res.data) ? res.data : [];
      setFarms(list);

      if (!farmId && list.length) {
        const id = list[0]._id;
        setFarmId(id);
        localStorage.setItem("admin_farmId", id);
      }
    } catch (e) {
      console.warn("loadFarms error:", e);
    }
  }, [farmId]);

  const loadRules = useCallback(async () => {
    if (!farmId) return;
    try {
      setLoading(true);
      const res = await api.get(`/alert-rules?farm_id=${encodeURIComponent(farmId)}`);
      setRules(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      toast.error(e?.response?.data?.error || e?.message || "โหลดกฎไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [farmId, toast]);

  useEffect(() => {
    loadFarms();
  }, [loadFarms]);

  useEffect(() => {
    if (!farmId) return;
    localStorage.setItem("admin_farmId", farmId);
    loadRules();
  }, [farmId, loadRules]);

  const resetForm = () => {
    setMetric("temperature");
    setOperator("gt");
    setThreshold("");
    setMessage("");
    setActionWater(false);
    setActionDuration(30);
  };

  const onCreate = async () => {
    if (!threshold || message.trim() === "") {
      toast.error("กรุณากำหนดค่าเงื่อนไขและข้อความแจ้งเตือน");
      return;
    }

    try {
      setSaving(true);
      await api.post(`/alert-rules?farm_id=${encodeURIComponent(farmId)}`, {
        metric,
        operator,
        threshold: Number(threshold),
        message: message.trim(),
        enabled: true,
        action: actionWater ? "water" : "none",
        duration_sec: actionWater ? Number(actionDuration || 30) : null,
      });

      toast.success("สร้างกฎสำเร็จ ✅");
      resetForm();
      loadRules();
    } catch (e) {
      toast.error(e?.response?.data?.error || e?.message || "สร้างกฎไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id) => {
    if (!confirm("ต้องการลบกฎนี้ใช่ไหม?")) return;
    try {
      await api.delete(`/alert-rules/${id}?farm_id=${encodeURIComponent(farmId)}`);
      toast.success("ลบสำเร็จ");
      loadRules();
    } catch (e) {
      toast.error(e?.response?.data?.error || e?.message || "ลบไม่สำเร็จ");
    }
  };

  const onToggleEnabled = async (rule) => {
    try {
      await api.put(`/alert-rules/${rule._id}?farm_id=${encodeURIComponent(farmId)}`, {
        metric: rule.metric,
        operator: rule.operator,
        threshold: rule.threshold,
        message: rule.message,
        enabled: !rule.enabled,
      });
      loadRules();
    } catch (e) {
      toast.error(e?.response?.data?.error || e?.message || "เปลี่ยนสถานะไม่สำเร็จ");
    }
  };

  const startEdit = (rule) => {
    setEditId(rule._id);
    setEditForm({
      metric: rule.metric,
      operator: rule.operator,
      threshold: String(rule.threshold),
      message: rule.message,
      enabled: rule.enabled,
      action: rule.action || "none",
      duration_sec: rule.duration_sec ?? 30,
    });
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditForm(null);
  };

  const saveEdit = async () => {
    if (!editId || !editForm) return;

    if (!editForm.threshold || editForm.message.trim() === "") {
      toast.error("กรุณากำหนดค่าเงื่อนไขและข้อความ");
      return;
    }

    try {
      setSaving(true);
      await api.put(`/alert-rules/${editId}?farm_id=${encodeURIComponent(farmId)}`, {
        metric: editForm.metric,
        operator: editForm.operator,
        threshold: Number(editForm.threshold),
        message: editForm.message.trim(),
        enabled: editForm.enabled,
        action: editForm.action || "none",
        duration_sec:
          editForm.action === "water" ? Number(editForm.duration_sec || 30) : null,
      });

      toast.success("แก้ไขสำเร็จ ✅");
      cancelEdit();
      loadRules();
    } catch (e) {
      toast.error(e?.response?.data?.error || e?.message || "แก้ไขไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const activeCount = useMemo(() => rules.filter((r) => r.enabled).length, [rules]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-2xl font-bold text-gray-900">ตั้งค่าการแจ้งเตือน</div>
            <div className="text-sm text-gray-500">
              กำหนดกฎแจ้งเตือนสำหรับแปลงผักบุ้งแต่ละฟาร์ม
            </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
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

          <Button variant="outline" onClick={loadRules} disabled={loading}>
            รีเฟรช
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-2 flex-wrap">
        <Badge>ทั้งหมด {rules.length} กฎ</Badge>
        <Badge>เปิดใช้งาน {activeCount}</Badge>
        <Badge>ปิด {rules.length - activeCount}</Badge>
      </div>

      {/* Create Form */}
      <Card className="p-5">
        <div className="text-lg font-bold text-gray-900">สร้างกฎใหม่</div>
          <div className="text-sm text-gray-500 mt-1">
            เลือกประเภท → เลือกต่ำกว่า/สูงกว่า → ใส่ค่า → ใส่ข้อความ → บันทึก
          </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div>
            <div className="text-sm font-semibold">ประเภท</div>
            <select
              className="border rounded-xl px-3 py-2 w-full text-sm"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
            >
              {METRICS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-sm font-semibold">เงื่อนไข</div>
            <select
              className="border rounded-xl px-3 py-2 w-full text-sm"
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
            >
              <option value="lt">ต่ำกว่า (&lt;)</option>
              <option value="gt">สูงกว่า (&gt;)</option>
            </select>
          </div>

          <div>
            <div className="text-sm font-semibold">ค่าเงื่อนไข</div>
            <Input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder="เช่น 35"
            />
          </div>

          <div className="flex items-end">
            <Button onClick={onCreate} disabled={saving || loading || !farmId} className="w-full">
              {saving ? "กำลังบันทึก..." : "บันทึกกฎ"}
            </Button>
          </div>

          <div className="md:col-span-4">
            <div className="text-sm font-semibold">ข้อความแจ้งเตือน</div>
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="เช่น อุณหภูมิสูงมาก ระวังพืชเฉา"
            />
          </div>

          <div className="md:col-span-4 flex flex-wrap gap-3 items-center">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={actionWater}
                onChange={(e) => setActionWater(e.target.checked)}
              />
              แนะนำให้รดน้ำเมื่อเข้าเงื่อนไข
            </label>

            {actionWater ? (
              <div className="flex items-center gap-2 text-sm">
                <span>ระยะเวลา (วินาที)</span>
                <Input
                  type="number"
                  min={1}
                  max={3600}
                  value={actionDuration}
                  onChange={(e) => setActionDuration(e.target.value)}
                  className="w-28"
                />
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      {/* Rules list */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div className="text-lg font-bold text-gray-900">รายการคำเตือนทั้งหมด</div>
          {loading ? <Spinner /> : <Badge>{rules.length} รายการ</Badge>}
        </div>

        {loading ? (
          <div className="mt-3 text-gray-600">กำลังโหลด...</div>
        ) : rules.length === 0 ? (
          <div className="mt-3 text-gray-500">ยังไม่มีการตั้งค่าคำเตือน</div>
        ) : (
          <div className="mt-4 space-y-3">
            {rules.map((r) => {
              const isEditing = editId === r._id;

              return (
                <div
                  key={r._id}
                  className={`border rounded-2xl p-4 ${
                    r.enabled ? "bg-white" : "bg-gray-50"
                  }`}
                >
                  {/* Header */}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-semibold text-gray-900">
                        {metricLabel(r.metric)}{" "}
                        <span className="text-gray-500 font-normal">
                          {OPERATOR_LABEL[r.operator]} {r.threshold}
                        </span>
                      </div>

                      <div className="text-sm text-gray-700 mt-1">
                        📢 {r.message}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => onToggleEnabled(r)}
                        disabled={saving}
                      >
                        {r.enabled ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                      </Button>

                      {!isEditing ? (
                        <Button variant="outline" onClick={() => startEdit(r)}>
                          แก้ไข
                        </Button>
                      ) : (
                        <Button variant="outline" onClick={cancelEdit}>
                          ยกเลิก
                        </Button>
                      )}

                      <Button variant="outline" onClick={() => onDelete(r._id)} disabled={saving}>
                        ลบ
                      </Button>
                    </div>
                  </div>

                  {/* Edit Form */}
                  {isEditing && editForm ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <div>
                        <div className="text-sm font-semibold">ประเภท</div>
                        <select
                          className="border rounded-xl px-3 py-2 w-full text-sm"
                          value={editForm.metric}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, metric: e.target.value }))
                          }
                        >
                          {METRICS.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div className="text-sm font-semibold">เงื่อนไข</div>
                        <select
                          className="border rounded-xl px-3 py-2 w-full text-sm"
                          value={editForm.operator}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, operator: e.target.value }))
                          }
                        >
                          <option value="lt">ต่ำกว่า (&lt;)</option>
                          <option value="gt">สูงกว่า (&gt;)</option>
                        </select>
                      </div>

                      <div>
                        <div className="text-sm font-semibold">ค่าเงื่อนไข</div>
                        <Input
                          type="number"
                          value={editForm.threshold}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, threshold: e.target.value }))
                          }
                        />
                      </div>

                      <div className="flex items-end">
                        <Button onClick={saveEdit} disabled={saving} className="w-full">
                          {saving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
                        </Button>
                      </div>

                      <div className="md:col-span-4">
                        <div className="text-sm font-semibold">ข้อความแจ้งเตือน</div>
                        <Input
                          value={editForm.message}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, message: e.target.value }))
                          }
                        />
                      </div>

                      <div className="md:col-span-4 flex flex-wrap gap-3 items-center">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={editForm.action === "water"}
                            onChange={(e) =>
                              setEditForm((p) => ({
                                ...p,
                                action: e.target.checked ? "water" : "none",
                              }))
                            }
                          />
                          แนะนำให้รดน้ำเมื่อเข้าเงื่อนไข
                        </label>

                        {editForm.action === "water" ? (
                          <div className="flex items-center gap-2 text-sm">
                            <span>ระยะเวลา (วินาที)</span>
                            <Input
                              type="number"
                              min={1}
                              max={3600}
                              value={editForm.duration_sec ?? 30}
                              onChange={(e) =>
                                setEditForm((p) => ({
                                  ...p,
                                  duration_sec: e.target.value,
                                }))
                              }
                              className="w-28"
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
