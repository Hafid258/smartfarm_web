import { useEffect, useMemo, useState } from "react";
import api from "../../services/api.js";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Input from "../../components/ui/Input.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Spinner from "../../components/ui/Spinner.jsx";
import { useToast } from "../../components/ui/ToastProvider.jsx";

export default function Farms() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [farmName, setFarmName] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setErr("");
    try {
      setLoading(true);
      // list farms for admin (dropdown)
      const [farmRes, userRes] = await Promise.all([
        api.get("/admin/farms"),
        api.get("/admin/users?limit=200"),
      ]);

      setItems(Array.isArray(farmRes.data) ? farmRes.data : []);
      setUsers(Array.isArray(userRes.data) ? userRes.data : userRes.data?.items || []);
    } catch (e) {
      setErr(e.message || "โหลดฟาร์มไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((f) => (f.farm_name || "").toLowerCase().includes(s));
  }, [items, q]);

  const usersByFarm = useMemo(() => {
    const map = new Map();
    users.forEach((u) => {
      const farmId = u?.farm_id?._id || u?.farm_id;
      if (!farmId) return;
      if (!map.has(farmId)) map.set(farmId, []);
      map.get(farmId).push(u);
    });
    return map;
  }, [users]);

  function renderFarmUsers(farmId) {
    const list = usersByFarm.get(farmId) || [];
    if (list.length === 0) return "-";
    const names = list
      .map((u) => u.username || u.email || u.phone || "user")
      .filter(Boolean);
    if (names.length <= 3) return names.join(", ");
    return `${names.slice(0, 3).join(", ")} +${names.length - 3}`;
  }

  async function create() {
    if (!farmName.trim()) return toast.error("กรุณากรอกชื่อฟาร์ม");
    try {
      setSaving(true);
      await api.post("/farms", { farm_name: farmName.trim() });
      toast.success("สร้างฟาร์มสำเร็จ");
      setFarmName("");
      await load();
    } catch (e) {
      toast.error(e.message || "สร้างไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function rename(f) {
    const name = window.prompt("แก้ไขชื่อฟาร์ม", f.farm_name || "");
    if (!name || !name.trim()) return;
    try {
      await api.put(`/farms/${f._id}`, { farm_name: name.trim() });
      toast.success("อัปเดตชื่อฟาร์มแล้ว");
      await load();
    } catch (e) {
      toast.error(e.message || "อัปเดตไม่สำเร็จ");
    }
  }

  async function remove(f) {
    const ok = window.confirm(`ยืนยันลบฟาร์ม "${f.farm_name}" ?`);
    if (!ok) return;
    try {
      await api.delete(`/farms/${f._id}`);
      toast.success("ลบฟาร์มแล้ว");
      await load();
    } catch (e) {
      toast.error(e.message || "ลบไม่สำเร็จ");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-2xl font-bold text-gray-900">Farms</div>
          <div className="text-sm text-gray-500">จัดการฟาร์ม (CRUD)</div>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          รีเฟรช
        </Button>
      </div>

      <Card className="p-5">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อฟาร์ม..." />
          <Badge variant="gray">{filtered.length} farms</Badge>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          <Input value={farmName} onChange={(e) => setFarmName(e.target.value)} placeholder="ชื่อฟาร์มใหม่..." />
          <Button onClick={create} disabled={saving}>
            {saving ? "กำลังสร้าง..." : "สร้างฟาร์ม"}
          </Button>
        </div>
      </Card>

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

        {!loading && !err && filtered.length === 0 && <div className="text-sm text-gray-500">ไม่พบฟาร์ม</div>}

        {!loading && !err && filtered.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((f) => (
              <div key={f._id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-gray-900">{f.farm_name}</div>
                    <div className="text-sm text-gray-500 mt-1">ผู้ที่เกี่ยวข้อง</div>
                  </div>
                  <Badge variant="blue">Farm</Badge>
                </div>

                <div className="mt-3 text-sm text-gray-700">
                  {renderFarmUsers(f._id)}
                </div>

                <div className="mt-4 flex gap-2">
                  <Button variant="outline" onClick={() => rename(f)}>
                    เปลี่ยนชื่อ
                  </Button>
                  <Button variant="danger" onClick={() => remove(f)}>
                    ลบ
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5 bg-emerald-50 border-emerald-200">
        <div className="font-semibold text-emerald-900">หมายเหตุ</div>
        <div className="text-sm text-emerald-800 mt-1">
          เพื่อความปลอดภัย แนะนำให้ backend จำกัดสิทธิ์ Farm CRUD เฉพาะ admin เท่านั้น
        </div>
      </Card>
    </div>
  );
}
