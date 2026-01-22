import { useEffect, useState } from "react";
import api from "../../services/api.js";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Input from "../../components/ui/Input.jsx";
import Spinner from "../../components/ui/Spinner.jsx";
import { useToast } from "../../components/ui/ToastProvider.jsx";
import { useNavigate } from "react-router-dom";

export default function Profile() {
  const toast = useToast();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);

  // profile data from backend
  const [profile, setProfile] = useState(null);

  // edit profile
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [editing, setEditing] = useState(false);

  // change password
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    nav("/login", { replace: true });
  }

  async function loadMe() {
    try {
      setLoading(true);
      const res = await api.get("/auth/me");
      setProfile(res.data || null);
      setUsername(res.data?.username || "");
      setEmail(res.data?.email || "");
      setPhone(res.data?.phone || "");
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message || "โหลดข้อมูลโปรไฟล์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    try {
      if (!username.trim()) return toast.error("กรุณากรอกชื่อผู้ใช้");
      if (!email.trim()) return toast.error("กรุณากรอก email");
      if (!email.includes("@")) return toast.error("รูปแบบ email ไม่ถูกต้อง");

      setSaving(true);

      const res = await api.put("/auth/me", {
        username: username.trim(),
        email: email.trim(),
        phone: phone.trim(),
      });

      setProfile(res.data?.user || null);
      setEditing(false);
      toast.success("บันทึกข้อมูลโปรไฟล์สำเร็จ");
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    try {
      if (!oldPassword.trim()) return toast.error("กรุณากรอกรหัสผ่านเดิม");
      if (newPassword.trim().length < 6) return toast.error("รหัสผ่านใหม่ต้องอย่างน้อย 6 ตัวอักษร");

      setChanging(true);

      await api.put("/auth/change-password", {
        oldPassword: oldPassword.trim(),
        newPassword: newPassword.trim(),
      });

      setOldPassword("");
      setNewPassword("");
      toast.success("เปลี่ยนรหัสผ่านสำเร็จ");
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message || "เปลี่ยนรหัสผ่านไม่สำเร็จ");
    } finally {
      setChanging(false);
    }
  }

  useEffect(() => {
    loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-2xl font-bold text-gray-900">Profile</div>
          <div className="text-sm text-gray-500">จัดการข้อมูลบัญชีผู้ใช้งาน (email / phone / password)</div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadMe} disabled={loading}>
            รีเฟรช
          </Button>
          <Button variant="danger" onClick={logout}>
            Logout
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <Card className="p-5">
          <div className="flex items-center gap-2 text-gray-600">
            <Spinner />
            <div>กำลังโหลดข้อมูลโปรไฟล์...</div>
          </div>
        </Card>
      )}

      {/* Profile Info */}
      {!loading && profile && (
        <>
          <Card className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-gray-900">ข้อมูลบัญชี</div>
                <div className="text-sm text-gray-500">ระบบดึงข้อมูลจาก API: /api/auth/me</div>
              </div>
              <Badge variant={profile.role === "admin" ? "blue" : "gray"}>{profile.role}</Badge>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="rounded-2xl border border-gray-100 p-4">
                <div className="text-gray-500">ชื่อผู้ใช้</div>
                <div className="font-semibold text-gray-900 mt-1">{profile.username}</div>
              </div>

              <div className="rounded-2xl border border-gray-100 p-4">
                <div className="text-gray-500">ชื่อฟาร์ม</div>
                <div className="font-semibold text-gray-900 mt-1">
                  {profile.farm_id?.farm_name || profile.farm_id || "-"}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 p-4">
                <div className="text-gray-500">Email</div>
                <div className="font-semibold text-gray-900 mt-1">{profile.email || "-"}</div>
              </div>

              <div className="rounded-2xl border border-gray-100 p-4">
                <div className="text-gray-500">เบอร์โทร</div>
                <div className="font-semibold text-gray-900 mt-1">{profile.phone || "-"}</div>
              </div>
            </div>

            <div className="mt-4">
              <Button variant="outline" onClick={() => setEditing((v) => !v)}>
                {editing ? "ปิดการแก้ไข" : "แก้ไขข้อมูล"}
              </Button>
            </div>
          </Card>

          {/* Edit Email/Phone */}
          {editing ? (
            <Card className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-lg font-semibold text-gray-900">แก้ไขข้อมูลผู้ใช้</div>
                <div className="text-sm text-gray-500 mt-1">อัปเดตผ่าน API: /api/auth/me</div>
              </div>
              <Badge variant="green">editable</Badge>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <div className="text-sm text-gray-600 mb-1">ชื่อผู้ใช้</div>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                />
              </div>

              <div>
                <div className="text-sm text-gray-600 mb-1">Email</div>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                />
              </div>

              <div>
                <div className="text-sm text-gray-600 mb-1">Phone</div>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="08x-xxx-xxxx"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <Button onClick={saveProfile} disabled={saving}>
                  {saving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    setUsername(profile.username || "");
                    setEmail(profile.email || "");
                    setPhone(profile.phone || "");
                    toast.info("รีเซ็ตข้อมูลกลับเป็นค่าเดิมแล้ว");
                  }}
                  disabled={saving}
                >
                  ยกเลิก
                </Button>
              </div>
            </div>
          </Card>
          ) : null}

          {/* Change Password */}
          <Card className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-lg font-semibold text-gray-900">เปลี่ยนรหัสผ่าน</div>
                <div className="text-sm text-gray-500 mt-1">อัปเดตผ่าน API: /api/auth/change-password</div>
              </div>
              <Badge variant="yellow">security</Badge>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <div className="text-sm text-gray-600 mb-1">รหัสผ่านเดิม</div>
                <Input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่านเดิม"
                />
              </div>

              <div>
                <div className="text-sm text-gray-600 mb-1">รหัสผ่านใหม่</div>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="อย่างน้อย 6 ตัวอักษร"
                />
                <div className="text-xs text-gray-400 mt-1">* รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร</div>
              </div>

              <div className="pt-2">
                <Button onClick={changePassword} disabled={changing}>
                  {changing ? "กำลังเปลี่ยน..." : "เปลี่ยนรหัสผ่าน"}
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}

      {/* no profile */}
      {!loading && !profile && (
        <Card className="p-5 border-yellow-200 bg-yellow-50">
          <div className="text-yellow-800 font-semibold">ไม่พบข้อมูลผู้ใช้งาน</div>
          <div className="text-sm text-yellow-700 mt-1">กรุณา Login ใหม่ หรือเช็ค token</div>
        </Card>
      )}
    </div>
  );
}
