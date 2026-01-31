import { useEffect, useState } from "react";
import api from "../../services/api.js";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Input from "../../components/ui/Input.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Spinner from "../../components/ui/Spinner.jsx";
import { useToast } from "../../components/ui/ToastProvider.jsx";

export default function Plants() {
  const toast = useToast();
  const [farms, setFarms] = useState([]);
  const [farmId, setFarmId] = useState(localStorage.getItem("admin_farmId") || "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [form, setForm] = useState({
    plant_name: "",
    plant_type: "",
    base_temperature: 10,
    planting_date: "",
  });

  async function loadFarms() {
    const res = await api.get("/farms");
    const list = Array.isArray(res.data) ? res.data : [];
    setFarms(list);
    if (!farmId && list.length) {
      setFarmId(list[0]._id);
      localStorage.setItem("admin_farmId", list[0]._id);
    }
  }

  async function loadPlant(fid) {
    if (!fid) return;
    setErr("");
    try {
      setLoading(true);
      const res = await api.get(`/plants?farm_id=${encodeURIComponent(fid)}`);
      const p = res.data;
      if (!p) {
        setForm({ plant_name: "", plant_type: "", base_temperature: 10, planting_date: "" });
      } else {
        setForm({
          plant_name: p.plant_name ?? "",
          plant_type: p.plant_type ?? "",
          base_temperature: p.base_temperature ?? 10,
          planting_date: p.planting_date ? String(p.planting_date).slice(0, 10) : "",
        });
      }
    } catch (e) {
      setErr(e.message || "โหลดข้อมูลพืชไม่สำเร็จ");
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
    loadPlant(farmId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmId]);

  async function save() {
    if (!farmId) return toast.error("กรุณาเลือกฟาร์ม");
    if (!form.plant_name.trim()) return toast.error("กรุณากรอกชื่อพืช");
    try {
      setSaving(true);
      await api.post(`/plants?farm_id=${encodeURIComponent(farmId)}`, {
        ...form,
        base_temperature: Number(form.base_temperature) || 10,
        planting_date: form.planting_date || undefined,
      });
      toast.success("บันทึกข้อมูลพืชสำเร็จ");
      await loadPlant(farmId);
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
          <div className="text-2xl font-bold text-gray-900">ข้อมูลพืช</div>
          <div className="text-sm text-gray-500">ตั้งค่าข้อมูลพืชรายฟาร์ม (แนะนำสำหรับผักบุ้ง)</div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <select
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
            value={farmId}
            onChange={(e) => setFarmId(e.target.value)}
          >
            {farms.length === 0 ? <option value="">ไม่มีฟาร์ม</option> : farms.map((f) => (
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-3">
              <div>
                <div className="text-sm text-gray-600 mb-1">ชื่อพืช</div>
                <Input value={form.plant_name} onChange={(e) => setForm((p) => ({ ...p, plant_name: e.target.value }))} />
              </div>

              <div>
                <div className="text-sm text-gray-600 mb-1">ประเภทพืช</div>
                <Input value={form.plant_type} onChange={(e) => setForm((p) => ({ ...p, plant_type: e.target.value }))} />
              </div>

              <div>
                <div className="text-sm text-gray-600 mb-1">อุณหภูมิฐาน (ใช้คำนวณ GDD)</div>
                <Input
                  type="number"
                  value={form.base_temperature}
                  onChange={(e) => setForm((p) => ({ ...p, base_temperature: e.target.value }))}
                />
              </div>

              <div>
                <div className="text-sm text-gray-600 mb-1">วันที่ปลูก</div>
                <Input
                  type="date"
                  value={form.planting_date}
                  onChange={(e) => setForm((p) => ({ ...p, planting_date: e.target.value }))}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="font-semibold text-emerald-900">คำแนะนำ</div>
              <div className="text-sm text-emerald-800 mt-1">
                ข้อมูลพืชจะช่วยคำนวณ GDD และแสดงข้อมูลการเติบโตของผักบุ้งได้แม่นยำขึ้น
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
