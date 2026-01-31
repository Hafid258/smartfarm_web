import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../services/api.js";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Spinner from "../../components/ui/Spinner.jsx";
import { useToast } from "../../components/ui/ToastProvider.jsx";

function fmtTime(t) {
  if (!t) return "-";
  return new Date(t).toLocaleString();
}

function diffSecFromNow(t) {
  if (!t) return null;
  const ms = Date.now() - new Date(t).getTime();
  return Math.floor(ms / 1000);
}

function isOnline(lastSeenAt, onlineSeconds = 60) {
  const diffSec = diffSecFromNow(lastSeenAt);
  if (diffSec === null) return false;
  return diffSec <= onlineSeconds;
}

function wifiLevel(rssi) {
  if (rssi === null || rssi === undefined) return "unknown";
  const x = Number(rssi);
  if (x >= -60) return "good";
  if (x >= -75) return "warning";
  return "danger";
}

function analyzeDevice(device, onlineSeconds = 60) {
  const issues = [];

  const diffSec = diffSecFromNow(device.last_seen_at);
  const online = isOnline(device.last_seen_at, onlineSeconds);

  if (!online) {
    if (diffSec === null) {
      issues.push("ยังไม่เคยส่งสถานะเข้าระบบ");
    } else {
      issues.push(`ขาดการติดต่อมาแล้ว ${diffSec} วินาที (เกิน ${onlineSeconds} วินาที)`);
    }
  }

  const wifi = wifiLevel(device.wifi_rssi);
  if (wifi === "danger") issues.push("สัญญาณ WiFi อ่อนมาก (RSSI ต่ำ) อาจหลุดบ่อย");
  if (wifi === "warning") issues.push("สัญญาณ WiFi ค่อนข้างอ่อน อาจมีดีเลย์");

  if (!device.ip) issues.push("ไม่มี IP (อาจไม่ได้เชื่อมต่อ WiFi หรือไม่ได้ส่งค่า ip)");

  if (device.dht_ok === false) issues.push("DHT22 มีปัญหา (อ่านค่าไม่สำเร็จ)");
  if (device.soil_ok === false) issues.push("เซนเซอร์ความชื้นดินมีปัญหา (อ่านค่าไม่สำเร็จ)");
  if (device.light_ok === false) issues.push("เซนเซอร์แสงมีปัญหา (อ่านค่าไม่สำเร็จ)");

  let status = "good";
  if (!online) status = "danger";
  if (device.dht_ok === false || device.soil_ok === false || device.light_ok === false) status = "danger";
  if (status === "good" && wifi === "warning") status = "warning";
  if (wifi === "danger") status = "danger";
  if (issues.length && status === "good") status = "warning";

  return {
    issues,
    status,
    connectionText: online ? "ออนไลน์" : "ออฟไลน์",
    diffSec,
    online,
    wifi,
  };
}

function statusStyle(status) {
  if (status === "good") return "border-emerald-200 bg-emerald-50";
  if (status === "warning") return "border-amber-200 bg-amber-50";
  if (status === "danger") return "border-red-200 bg-red-50";
  return "border-gray-200 bg-white";
}

function statusBadge(status) {
  if (status === "good") return "ดี";
  if (status === "warning") return "ควรระวัง";
  if (status === "danger") return "อันตราย";
  return "ปกติ";
}

function wifiText(wifi, rssi) {
  if (wifi === "unknown") return "-";
  if (wifi === "good") return `ดี (${rssi} dBm)`;
  if (wifi === "warning") return `อ่อน (${rssi} dBm)`;
  return `อ่อนมาก (${rssi} dBm)`;
}

function lightText(percent, raw) {
  if (percent !== null && percent !== undefined && !Number.isNaN(Number(percent))) {
    return `${Number(percent)}%`;
  }
  if (raw !== null && raw !== undefined && !Number.isNaN(Number(raw))) {
    return String(raw);
  }
  return "-";
}

export default function DeviceStatus() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState([]);
  const [err, setErr] = useState("");
  const [pumpBusy, setPumpBusy] = useState({});

  const loadDevices = useCallback(async () => {
    try {
      setLoading(true);
      setErr("");
      const bust = `_=${Date.now()}`;
      const res = await api.get(`/device-status/status?${bust}`);
      setDevices(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || "โหลดสถานะอุปกรณ์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
    const t = setInterval(loadDevices, 15000);
    return () => clearInterval(t);
  }, [loadDevices]);

  const cards = useMemo(() => {
    return devices.map((d) => ({ ...d, ...analyzeDevice(d, 60) }));
  }, [devices]);

  const stats = useMemo(() => {
    const onlineCount = cards.filter((x) => x.online).length;
    const offlineCount = cards.length - onlineCount;
    return { onlineCount, offlineCount };
  }, [cards]);

  const setBusy = (id, v) => {
    setPumpBusy((prev) => ({ ...prev, [id]: v }));
  };

  const sendPump = async (command, deviceId) => {
    try {
      setBusy(deviceId, true);
      await api.post("/device/command", {
        command,
        device_id: deviceId,
      });
      const action = command === "ON" ? "เริ่มรดน้ำ" : command === "OFF" ? "หยุดรดน้ำ" : command;
      toast.success(`สั่งงานปั๊มสำเร็จ: ${action}`);
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message || "ส่งคำสั่งไม่สำเร็จ");
    } finally {
      setBusy(deviceId, false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-2xl font-bold text-gray-900">สถานะอุปกรณ์</div>
          <div className="text-sm text-gray-500">ตรวจสอบอุปกรณ์ในแปลงผักบุ้งของคุณ</div>
        </div>

        <Button variant="outline" onClick={loadDevices} disabled={loading}>
          รีเฟรช
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge>ทั้งหมด {cards.length} เครื่อง</Badge>
        <Badge>ออนไลน์ {stats.onlineCount}</Badge>
        <Badge>ออฟไลน์ {stats.offlineCount}</Badge>
      </div>

      {err && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl">
          {err}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-3 text-gray-600">
          <Spinner />
          <div>กำลังโหลดสถานะอุปกรณ์...</div>
        </div>
      ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((d) => (
            <Card
              key={d._id}
              className={`p-5 border rounded-2xl ${statusStyle(d.status)}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-gray-900">
                    {d.device_key}
                  </div>
                  <div className="text-sm text-gray-700 mt-1">
                    สถานะ:{" "}
                    <span
                      className={`font-semibold ${
                        d.online ? "text-emerald-700" : "text-red-700"
                      }`}
                    >
                      {d.connectionText}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    ล่าสุด: {fmtTime(d.last_seen_at)}{" "}
                    {d.diffSec !== null ? `(ห่าง ${d.diffSec} วินาที)` : ""}
                  </div>
                </div>

                <Badge>{statusBadge(d.status)}</Badge>
              </div>

              <div className="mt-4 space-y-2 text-sm text-gray-800">
                <div className="flex justify-between">
                  <span className="text-gray-600">IP</span>
                  <span className="font-semibold">{d.ip || "-"}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-600">WiFi</span>
                  <span className="font-semibold">{wifiText(d.wifi, d.wifi_rssi)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-600">ปั๊มน้ำ</span>
                  <span className="font-semibold">
                    {d.pump_state === "ON" ? "เปิด" : "ปิด"}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-600">DHT22</span>
                  <span
                    className={`font-semibold ${
                      d.dht_ok ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {d.dht_ok ? "ปกติ" : "ผิดปกติ"}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-600">เซนเซอร์ดิน</span>
                  <span
                    className={`font-semibold ${
                      d.soil_ok ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {d.soil_ok ? "ปกติ" : "ผิดปกติ"}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-600">แสง</span>
                  <span
                    className={`font-semibold ${
                      d.light_ok === false
                        ? "text-red-700"
                        : lightText(d.light_percent, d.light_raw_adc) === "-"
                          ? "text-gray-500"
                          : "text-emerald-700"
                    }`}
                  >
                    {lightText(d.light_percent, d.light_raw_adc)}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-600">เฟิร์มแวร์</span>
                  <span className="font-semibold">{d.fw_version || "-"}</span>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  onClick={() => sendPump("ON", d.device_key)}
                  disabled={pumpBusy[d.device_key] || !d.online}
                >
                  {pumpBusy[d.device_key] ? "กำลังส่ง..." : "รดน้ำ"}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => sendPump("OFF", d.device_key)}
                  disabled={pumpBusy[d.device_key] || !d.online}
                >
                  หยุด
                </Button>
              </div>

              <div className="mt-4">
                <div className="text-sm font-semibold text-gray-900">ปัญหาที่พบ</div>

                {d.issues.length === 0 ? (
                  <div className="mt-2 text-sm text-emerald-700 font-semibold">
                    ✅ ไม่พบปัญหา
                  </div>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm text-red-700 list-disc pl-5">
                    {d.issues.map((x, idx) => (
                      <li key={idx}>{x}</li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
