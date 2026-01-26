import { useEffect, useMemo, useState } from "react";
import api from "../../services/api.js";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Input from "../../components/ui/Input.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Spinner from "../../components/ui/Spinner.jsx";
import { useToast } from "../../components/ui/ToastProvider.jsx";

export default function NotificationsMonitor() {
  const toast = useToast();

  const [farms, setFarms] = useState([]);
  const [farmId, setFarmId] = useState(localStorage.getItem("admin_farmId") || "");

  const [users, setUsers] = useState([]);
  const [targetUserId, setTargetUserId] = useState(""); // ✅ user ที่เลือกส่ง discord test

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [onlyUnread, setOnlyUnread] = useState(false);

  // ✅ Discord test
  const [testMsg, setTestMsg] = useState("✅ SmartFarm: ทดสอบส่งข้อความเข้า Discord");
  const [sending, setSending] = useState(false);

  async function loadFarms() {
    try {
      const res = await api.get("/farms");
      const list = Array.isArray(res.data) ? res.data : [];
      setFarms(list);

      if (!farmId && list.length) {
        setFarmId(list[0]._id);
        localStorage.setItem("admin_farmId", list[0]._id);
      }
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message || "โหลดฟาร์มไม่สำเร็จ");
    }
  }

  async function loadUsers() {
    try {
      const res = await api.get("/admin/users");
      const list = Array.isArray(res.data) ? res.data : [];
      setUsers(list);
    } catch (e) {
      // ไม่ต้อง toast หนัก เพราะบางที admin route อาจยังไม่พร้อม
      console.log("loadUsers failed:", e?.response?.data || e.message);
    }
  }

  async function loadNotifications(fid) {
    if (!fid) return;
    setErr("");
    try {
      setLoading(true);
      const res = await api.get(`/notifications?farm_id=${encodeURIComponent(fid)}&limit=200`);
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || "โหลดแจ้งเตือนไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFarms();
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!farmId) return;
    localStorage.setItem("admin_farmId", farmId);
    loadNotifications(farmId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmId]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((n) => {
      if (onlyUnread && n.is_read) return false;
      if (!s) return true;

      const hay = `${n.alert_type || ""} ${n.details || ""} ${n.severity || ""}`.toLowerCase();
      return hay.includes(s);
    });
  }, [items, q, onlyUnread]);

  async function markRead(id) {
    try {
      await api.put(`/notifications/${id}/read`);
      setItems((prev) => prev.map((x) => (x._id === id ? { ...x, is_read: true } : x)));
      toast.success("ทำเครื่องหมายว่าอ่านแล้ว ✅");
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message || "อัปเดตไม่สำเร็จ");
    }
  }

  // ✅ ส่ง Discord test (เลือก user ได้)
  async function sendDiscordTest() {
    try {
      if (!testMsg.trim()) return toast.error("กรุณากรอกข้อความก่อนส่ง");

      setSending(true);

      if (targetUserId) {
        // ✅ ส่งไป webhook ของ user ที่เลือก
        await api.post("/discord/test-user", {
          user_id: targetUserId,
          message: testMsg.trim(),
        });

        const u = users.find((x) => x._id === targetUserId);
        toast.success(`ส่ง Discord ให้ ${u?.username || "user"} สำเร็จ ✅`);
      } else {
        // ✅ ส่งไป webhook ของตัวเอง
        await api.post("/discord/test", { message: testMsg.trim() });
        toast.success("ส่ง Discord (ของคุณ) สำเร็จ ✅");
      }
    } catch (e) {
      console.log("DISCORD ERROR:", e?.response?.data || e.message);
      toast.error(e?.response?.data?.error || e.message || "ส่ง Discord ไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-2xl font-bold text-gray-900">Notifications Monitor</div>
          <div className="text-sm text-gray-500">มอนิเตอร์แจ้งเตือน + ทดสอบส่ง Discord</div>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          {/* Farm select */}
          <select
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
            value={farmId}
            onChange={(e) => setFarmId(e.target.value)}
          >
            {farms.length === 0 ? (
              <option value="">No farms</option>
            ) : (
              farms.map((f) => (
                <option key={f._id} value={f._id}>
                  {f.farm_name}
                </option>
              ))
            )}
          </select>

          {/* User select (Discord target) */}
          <select
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
            title="เลือก user เพื่อทดสอบส่ง Discord"
          >
            <option value="">ส่งไป Discord ของฉัน (Admin)</option>
            {users.map((u) => (
              <option key={u._id} value={u._id}>
                {u.username} ({u.role})
              </option>
            ))}
          </select>

          <Button variant="outline" onClick={() => loadNotifications(farmId)} disabled={loading || !farmId}>
            รีเฟรช
          </Button>

          <Button onClick={sendDiscordTest} disabled={sending}>
            {sending ? "กำลังส่ง..." : "ทดสอบส่ง Discord"}
          </Button>
        </div>
      </div>

      {/* Search + Filter + Discord message */}
      <Card className="p-5">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex-1">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหา alert/details/severity..."
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setOnlyUnread((v) => !v)}
              className={`rounded-xl border px-3 py-2 text-sm transition ${
                onlyUnread
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-white border-gray-300 text-gray-700"
              }`}
            >
              {onlyUnread ? "เฉพาะยังไม่อ่าน" : "ทั้งหมด"}
            </button>

            <Badge variant="gray">{filtered.length} items</Badge>
          </div>
        </div>

        {/* Discord message box */}
        <div className="mt-4">
          <div className="text-xs text-gray-500 mb-1">
            ข้อความทดสอบส่งไป Discord{" "}
            {targetUserId
              ? `(ส่งให้ user: ${users.find((u) => u._id === targetUserId)?.username || "เลือก user"})`
              : "(ส่งให้ Discord ของคุณ)"}
          </div>
          <Input value={testMsg} onChange={(e) => setTestMsg(e.target.value)} placeholder="พิมพ์ข้อความ..." />
          <div className="text-xs text-gray-400 mt-1">
            * ระบบจะเรียก <span className="font-mono">POST /api/discord/test</span> หรือ{" "}
            <span className="font-mono">POST /api/discord/test-user</span>
          </div>
        </div>
      </Card>

      {/* List */}
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

        {!loading && !err && filtered.length === 0 && (
          <div className="text-sm text-gray-500">ยังไม่มีแจ้งเตือน หรือไม่พบตามเงื่อนไข</div>
        )}

        {!loading && !err && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((n) => {
              const sev = n.severity || "low";
              const sevBadge = sev === "high" ? "red" : sev === "medium" ? "yellow" : "gray";

              return (
                <div
                  key={n._id}
                  className={`rounded-2xl border p-4 ${
                    n.is_read ? "border-gray-100 bg-white" : "border-emerald-200 bg-emerald-50"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-gray-900">{n.alert_type || "Notification"}</div>
                        <Badge variant={sevBadge}>{sev}</Badge>
                        {!n.is_read ? <Badge variant="green">NEW</Badge> : <Badge variant="gray">read</Badge>}
                      </div>

                      <div className="text-sm text-gray-700 mt-2 break-words">{n.details || "-"}</div>

                      <div className="text-xs text-gray-400 mt-2">
                        {n.timestamp ? new Date(n.timestamp).toLocaleString() : "-"}
                      </div>
                    </div>

                    <div className="shrink-0 flex gap-2">
                      {!n.is_read && (
                        <Button variant="outline" onClick={() => markRead(n._id)}>
                          อ่านแล้ว
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
