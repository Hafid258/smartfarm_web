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

      // ✅ ใช้ /admin/farms สำหรับ admin (มีไว้โดยเฉพาะ) และ fallback ไป /farms
      const [farmRes, userRes] = await Promise.all([
        api.get("/admin/farms").catch(() => api.get("/farms")),
        api.get("/admin/users?limit=200"),
      ]);

      // ✅ รองรับหลายรูปแบบ response: array | {items:[]} | {farms:[]}
      const farms =
        Array.isArray(farmRes.data)
          ? farmRes.data
          : Array.isArray(farmRes.data?.items)
            ? farmRes.data.items
            : Array.isArray(farmRes.data?.farms)
              ? farmRes.data.farms
              : [];

      setItems(farms);
      setUsers(Array.isArray(userRes.data) ? userRes.data : userRes.data?.items || []);
    } catch (e) {
      setErr(e?.message || "โหลดฟาร์มไม่สำเร็จ");
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
      toast.error(e?.message || "สร้างไม่สำเร็จ");
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
      toast.error(e?.message || "อัปเดตไม่สำเร็จ");
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
      toast.error(e?.message || "ลบไม่สำเร็จ");
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Farms</h1>
          <p className="text-sm opacity-70">จัดการฟาร์มในระบบ</p>
        </div>

        <div className="flex gap-2 items-center">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาฟาร์ม..."
            className="w-64"
          />
        </div>
      </div>

      {err ? (
        <Card className="p-4">
          <div className="text-red-600">{err}</div>
        </Card>
      ) : null}

      <Card className="p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="font-medium">เพิ่มฟาร์มใหม่</div>
          <div className="flex gap-2">
            <Input
              value={farmName}
              onChange={(e) => setFarmName(e.target.value)}
              placeholder="ชื่อฟาร์ม"
              className="w-64"
            />
            <Button onClick={create} disabled={saving}>
              {saving ? "กำลังบันทึก..." : "เพิ่ม"}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-medium">
            รายการฟาร์ม <Badge>{filtered.length}</Badge>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="opacity-70">ไม่พบฟาร์ม</div>
        ) : (
          <div className="space-y-3">
            {filtered.map((f) => (
              <div
                key={f._id}
                className="border rounded-lg p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{f.farm_name || "-"}</div>
                  <div className="text-xs opacity-70">
                    ID: <span className="font-mono">{String(f._id)}</span>
                  </div>
                  <div className="text-xs opacity-70">
                    Users: {renderFarmUsers(String(f._id))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => rename(f)}>
                    แก้ไข
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
    </div>
  );
}
