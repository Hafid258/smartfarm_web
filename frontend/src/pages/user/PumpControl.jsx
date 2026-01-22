import { useEffect, useState } from "react";
import api from "../../services/api.js";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Input from "../../components/ui/Input.jsx";
import Spinner from "../../components/ui/Spinner.jsx";
import { useToast } from "../../components/ui/ToastProvider.jsx";

export default function PumpControl() {
  const toast = useToast();

  const [busy, setBusy] = useState(false);
  const [duration, setDuration] = useState(30);
  const [usage, setUsage] = useState([]);
  const [logs, setLogs] = useState([]);

  const loadAll = async () => {
    const [uRes, cRes] = await Promise.all([
      api.get("/water-usage?limit=200"),
      api.get("/device/commands?limit=200"),
    ]);
    setUsage(uRes.data || []);
    setLogs(cRes.data || []);
  };

  useEffect(() => {
    loadAll().catch(() => {});
  }, []);

  const sendCommand = async (command) => {
    try {
      setBusy(true);
      await api.post("/device/command", {
        command,
        duration_sec: command === "ON" ? Number(duration || 30) : 0,
        device_id: "pump",
      });
      toast?.push?.({ type: "success", message: `สั่งปั๊ม: ${command}` });
      await loadAll();
    } catch (e) {
      toast?.push?.({ type: "error", message: e?.response?.data?.detail || "สั่งปั๊มไม่สำเร็จ" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="text-lg font-semibold">ควบคุมปั๊มน้ำ</div>
        <div className="text-sm text-gray-500 mb-3">สั่ง ON/OFF และกำหนดเวลา (วินาที)</div>

        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-28"
            placeholder="30"
          />
          <Button disabled={busy} onClick={() => sendCommand("ON")}>
            {busy ? <Spinner /> : "เปิด"}
          </Button>
          <Button disabled={busy} variant="danger" onClick={() => sendCommand("OFF")}>
            {busy ? <Spinner /> : "ปิด"}
          </Button>
          <Button onClick={loadAll}>รีเฟรช</Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-lg font-semibold">ประวัติการใช้น้ำ</div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">เวลาเริ่ม</th>
                <th className="py-2">ระยะเวลา (วิ)</th>
                <th className="py-2">ลิตร (ประมาณ)</th>
                <th className="py-2">แหล่งคำสั่ง</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((r) => (
                <tr key={r._id} className="border-b">
                  <td className="py-2">{new Date(r.started_at).toLocaleString()}</td>
                  <td className="py-2">{r.duration_sec}</td>
                  <td className="py-2">{Number(r.liters_est || 0).toFixed(2)}</td>
                  <td className="py-2">{r.source}</td>
                </tr>
              ))}
              {usage.length === 0 && (
                <tr>
                  <td className="py-3 text-gray-500" colSpan={4}>
                    ยังไม่มีประวัติ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-lg font-semibold">คำสั่งอุปกรณ์ (ล่าสุด)</div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">เวลา</th>
                <th className="py-2">คำสั่ง</th>
                <th className="py-2">Duration</th>
                <th className="py-2">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((c) => (
                <tr key={c._id} className="border-b">
                  <td className="py-2">{new Date(c.timestamp).toLocaleString()}</td>
                  <td className="py-2">{c.command}</td>
                  <td className="py-2">{c.duration_sec || 0}</td>
                  <td className="py-2">{c.status}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td className="py-3 text-gray-500" colSpan={4}>
                    ยังไม่มีคำสั่ง
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
