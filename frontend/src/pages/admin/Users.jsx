import { useEffect, useMemo, useState } from "react";
import api from "../../services/api.js";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Input from "../../components/ui/Input.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Spinner from "../../components/ui/Spinner.jsx";
import { useToast } from "../../components/ui/ToastProvider.jsx";

const emptyForm = {
  username: "",
  email: "",
  phone: "",
  role: "user",
  farm_id: "",
  password: "",
  is_active: true,
};

export default function Users() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [users, setUsers] = useState([]);
  const [farms, setFarms] = useState([]);

  const [q, setQ] = useState("");
  const [mode, setMode] = useState("create"); // create | edit
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState(emptyForm);

  function pickError(e, fallback) {
    return e?.response?.data?.error || e?.message || fallback;
  }

  async function load() {
    setErr("");
    try {
      setLoading(true);
      const [uRes, fRes] = await Promise.all([api.get("/admin/users"), api.get("/farms")]);

      // ✅ รองรับ backend 2 แบบ:
      // 1) แบบเก่า: uRes.data = []
      // 2) แบบใหม่: uRes.data = { items: [], total, page, ... }
      const userList = Array.isArray(uRes.data) ? uRes.data : uRes.data?.items || [];
      setUsers(Array.isArray(userList) ? userList : []);

      const farmList = Array.isArray(fRes.data) ? fRes.data : [];
      setFarms(farmList);

      // ตั้งค่า farm_id เริ่มต้นถ้าฟอร์มยังไม่เลือก
      if (!form.farm_id && farmList.length) {
        setForm((p) => ({ ...p, farm_id: farmList[0]._id }));
      }
    } catch (e) {
      setErr(pickError(e, "โหลดข้อมูลไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return users;

    return users.filter((u) => {
      const farmName =
        (u.farm_id && typeof u.farm_id === "object" ? u.farm_id.farm_name : "") || "";

      const hay = `${u.username || ""} ${u.email || ""} ${u.phone || ""} ${u.role || ""} ${farmName}`.toLowerCase();
      return hay.includes(s);
    });
  }, [users, q]);

  function startCreate() {
    setMode("create");
    setEditingId("");
    setForm((p) => ({ ...emptyForm, farm_id: p.farm_id || farms?.[0]?._id || "" }));
  }

  function startEdit(u) {
    setMode("edit");
    setEditingId(u._id);
    setForm({
      username: u.username || "",
      email: u.email || "",
      phone: u.phone || "",
      role: u.role || "user",
      farm_id: u.farm_id?._id || u.farm_id || "",
      password: "", // optional reset
      is_active: Boolean(u.is_active),
    });
  }

  async function submit() {
    setErr("");

    if (!form.username.trim()) return toast.error("กรุณากรอกชื่อผู้ใช้");
    if (!form.email.trim()) return toast.error("กรุณากรอกอีเมล");

    // ✅ ถ้า farms มีข้อมูล แต่ยังไม่เลือกฟาร์ม ให้เตือน
    // (ถ้าคุณอยาก allow user ที่ไม่มีฟาร์ม ให้คอมเมนต์บรรทัดนี้ได้)
    if (farms.length > 0 && !form.farm_id) return toast.error("กรุณาเลือกฟาร์ม");

    try {
      setSaving(true);

      const payload = {
        username: form.username.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        role: form.role,
        // ✅ ส่ง null ถ้าไม่เลือกฟาร์ม (backend รองรับ)
        farm_id: form.farm_id ? form.farm_id : null,
        is_active: form.is_active,
      };

      // include password only if provided
      if (form.password?.trim()) payload.password = form.password.trim();

      if (mode === "create") {
        await api.post("/admin/users", { ...payload, password: payload.password || undefined });
        toast.success("สร้างผู้ใช้สำเร็จ");
      } else {
        await api.put(`/admin/users/${editingId}`, payload);
        toast.success("อัปเดตผู้ใช้สำเร็จ");
      }

      await load();
      startCreate();
    } catch (e) {
      const m = pickError(e, "บันทึกไม่สำเร็จ");
      setErr(m);
      toast.error(m);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    const ok = window.confirm("ยืนยันลบผู้ใช้นี้?");
    if (!ok) return;
    try {
      await api.delete(`/admin/users/${id}`);
      toast.success("ลบผู้ใช้แล้ว");
      await load();
      if (editingId === id) startCreate();
    } catch (e) {
      toast.error(pickError(e, "ลบไม่สำเร็จ"));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-2xl font-bold text-gray-900">ผู้ใช้งาน</div>
          <div className="text-sm text-gray-500">จัดการบัญชีผู้ดูแลและผู้ใช้งาน</div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            รีเฟรช
          </Button>
          <Button variant="secondary" onClick={startCreate} disabled={saving}>
            + เพิ่มผู้ใช้
          </Button>
        </div>
      </div>

      <Card className="p-5">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex-1">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา ชื่อผู้ใช้/อีเมล/สิทธิ์/ฟาร์ม..." />
          </div>
          <Badge variant="gray">{filtered.length} คน</Badge>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold text-gray-900">รายการผู้ใช้งาน</div>
            {loading ? <Badge variant="gray">กำลังโหลด</Badge> : <Badge variant="blue">รายการ</Badge>}
          </div>

          {loading && (
            <div className="mt-4 flex items-center gap-2 text-gray-600">
              <Spinner />
              <div>กำลังโหลด...</div>
            </div>
          )}

          {!loading && err && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
          )}

          {!loading && !err && filtered.length === 0 && (
            <div className="mt-4 text-sm text-gray-500">ไม่พบผู้ใช้</div>
          )}

          {!loading && !err && filtered.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-gray-500">
                  <tr className="border-b">
                    <th className="py-2 pr-4">ชื่อผู้ใช้</th>
                    <th className="py-2 pr-4">อีเมล</th>
                    <th className="py-2 pr-4">สิทธิ์</th>
                    <th className="py-2 pr-4">ฟาร์ม</th>
                    <th className="py-2 pr-4">สถานะ</th>
                    <th className="py-2 pr-4">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr key={u._id} className="border-b last:border-b-0">
                      <td className="py-2 pr-4 font-medium text-gray-900">{u.username}</td>
                      <td className="py-2 pr-4 text-gray-700">{u.email}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={u.role === "admin" ? "blue" : "gray"}>{u.role}</Badge>
                      </td>
                      <td className="py-2 pr-4 text-gray-700">{u.farm_id?.farm_name || "-"}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={u.is_active ? "green" : "red"}>{u.is_active ? "ใช้งาน" : "ปิดใช้งาน"}</Badge>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={() => startEdit(u)}>
                            แก้ไข
                          </Button>
                          <Button variant="danger" onClick={() => remove(u._id)}>
                            ลบ
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold text-gray-900">
              {mode === "create" ? "สร้างผู้ใช้" : "แก้ไขผู้ใช้"}
            </div>
            <Badge variant={mode === "create" ? "green" : "yellow"}>{mode === "create" ? "สร้างใหม่" : "แก้ไข"}</Badge>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <div className="text-sm text-gray-600 mb-1">ชื่อผู้ใช้</div>
              <Input value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} />
            </div>

            <div>
              <div className="text-sm text-gray-600 mb-1">อีเมล</div>
              <Input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
            </div>

            <div>
              <div className="text-sm text-gray-600 mb-1">เบอร์โทร</div>
              <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-sm text-gray-600 mb-1">สิทธิ์</div>
                <select
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                  value={form.role}
                  onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                >
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </div>

              <div>
                <div className="text-sm text-gray-600 mb-1">ฟาร์ม</div>
                <select
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                  value={form.farm_id}
                  onChange={(e) => setForm((p) => ({ ...p, farm_id: e.target.value }))}
                >
                  <option value="">(ไม่ผูกฟาร์ม)</option>
                  {farms.map((f) => (
                    <option key={f._id} value={f._id}>
                      {f.farm_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="is_active"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
              />
              <label htmlFor="is_active" className="text-sm text-gray-700">
                เปิดใช้งาน
              </label>
            </div>

            <div>
              <div className="text-sm text-gray-600 mb-1">
                รหัสผ่าน {mode === "edit" ? "(ใส่เพื่อรีเซ็ต)" : "(ถ้าไม่ใส่ ระบบจะตั้งค่าเริ่มต้น 123456)"}
              </div>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="อย่างน้อย 6 ตัวอักษร"
              />
            </div>

            <div className="pt-2 flex gap-2">
              <Button onClick={submit} disabled={saving}>
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </Button>
              <Button variant="outline" onClick={startCreate} disabled={saving}>
                ล้างฟอร์ม
              </Button>
            </div>

            {err && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
