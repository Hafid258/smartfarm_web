import { useEffect, useMemo, useState } from "react";
import api from "../../services/api.js";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Spinner from "../../components/ui/Spinner.jsx";
import Input from "../../components/ui/Input.jsx";
import { useToast } from "../../components/ui/ToastProvider.jsx";

function isSameDay(ts, dateStr) {
  if (!dateStr) return true;
  if (!ts) return false;

  const d = new Date(ts);
  const [y, m, day] = dateStr.split("-").map(Number);

  return (
    d.getFullYear() === y &&
    d.getMonth() + 1 === m &&
    d.getDate() === day
  );
}

function todayStr() {
  const t = new Date();
  const yyyy = t.getFullYear();
  const mm = String(t.getMonth() + 1).padStart(2, "0");
  const dd = String(t.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function Notifications() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");

  async function load() {
    setErr("");
    try {
      setLoading(true);
      const res = await api.get("/notifications?limit=200"); // ไม่ส่ง farm_id
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setErr(e.message || "โหลดแจ้งเตือนไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const availableDates = useMemo(() => {
    const set = new Set();
    items.forEach((x) => {
      const ts = x.timestamp || x.created_at;
      if (!ts) return;
      const d = new Date(ts);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      set.add(`${yyyy}-${mm}-${dd}`);
    });
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [items]);

  useEffect(() => {
    if (!selectedDate) return;
    if (!availableDates.includes(selectedDate)) setSelectedDate("");
  }, [availableDates, selectedDate]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((n) => {
      if (onlyUnread && n.is_read) return false;
      if (selectedDate && !isSameDay(n.timestamp || n.created_at, selectedDate)) return false;
      if (!s) return true;
      const hay = `${n.alert_type || ""} ${n.details || ""} ${n.severity || ""}`.toLowerCase();
      return hay.includes(s);
    });
  }, [items, q, onlyUnread, selectedDate]);

  async function markRead(id) {
    try {
      await api.put(`/notifications/${id}/read`);
      setItems((prev) => prev.map((x) => (x._id === id ? { ...x, is_read: true } : x)));
      toast.success("ทำเครื่องหมายว่าอ่านแล้ว");
    } catch (e) {
      toast.error(e.message || "อัปเดตไม่สำเร็จ");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-2xl font-bold text-gray-900">Notifications</div>
          <div className="text-sm text-gray-500">รายการแจ้งเตือนจากระบบ (MongoDB)</div>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          รีเฟรช
        </Button>
      </div>

      <Card className="p-5">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex-1">
            <Input
              placeholder="ค้นหา (เช่น TEMP, soil, high...)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border rounded-xl px-3 py-2 text-sm bg-white"
              title="เลือกวันที่"
            >
              <option value="">แสดงทั้งหมด</option>
              {availableDates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <Button
              variant="outline"
              onClick={() => {
                const t = todayStr();
                if (availableDates.includes(t)) setSelectedDate(t);
              }}
            >
              วันนี้
            </Button>

            <Button variant="outline" onClick={() => setSelectedDate("")}>
              ล้าง
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOnlyUnread((v) => !v)}
              className={`rounded-xl border px-3 py-2 text-sm transition ${
                onlyUnread ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-white border-gray-300 text-gray-700"
              }`}
            >
              {onlyUnread ? "แสดงเฉพาะยังไม่อ่าน" : "แสดงทั้งหมด"}
            </button>
            <Badge variant="gray">{filtered.length} รายการ</Badge>
          </div>
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
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {err}
          </div>
        )}

        {!loading && !err && filtered.length === 0 && (
          <div className="text-sm text-gray-500">
            {items.length === 0 ? "ยังไม่มีการแจ้งเตือน" : "ไม่พบรายการตามเงื่อนไขค้นหา"}
          </div>
        )}

        {!loading && !err && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((n) => {
              const sev = n.severity || "low";
              const sevBadge =
                sev === "high" ? "red" : sev === "medium" ? "yellow" : sev === "low" ? "gray" : "blue";

              return (
                <div
                  key={n._id}
                  className={`rounded-2xl border p-4 transition ${
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
                      <div className="text-sm text-gray-700 mt-2 break-words">
                        {n.details || "-"}
                      </div>
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
