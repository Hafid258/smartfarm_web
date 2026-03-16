import { useRef } from "react";
import Card from "./ui/Card.jsx";
import Button from "./ui/Button.jsx";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

function toDate(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtTime(ts) {
  const d = toDate(ts);
  if (!d) return "-";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function fmtDateTime(ts) {
  const d = toDate(ts);
  if (!d) return "-";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${m}/${day} ${hh}:${mm}`;
}

function isSingleDay(data, xKey) {
  if (!Array.isArray(data) || data.length < 2) return true;

  const first = toDate(data[0]?.[xKey]);
  const last = toDate(data[data.length - 1]?.[xKey]);
  if (!first || !last) return true;

  return (
    first.getFullYear() === last.getFullYear() &&
    first.getMonth() === last.getMonth() &&
    first.getDate() === last.getDate()
  );
}

function CustomTooltip({ active, payload, label, valueFormatter, showDate }) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value;

  return (
    <div className="rounded-xl border bg-white p-3 text-sm shadow">
      <div className="font-semibold text-gray-900">
        {showDate ? fmtDateTime(label) : fmtTime(label)}
      </div>
      <div className="mt-1 text-gray-700">
        ค่า: <b>{valueFormatter ? valueFormatter(v) : v}</b>
      </div>
    </div>
  );
}

export default function LineChartCard({
  title,
  data = [],
  dataKey,
  xKey = "timestamp",
  unit = "",
  valueFormatter,
  exportName,
}) {
  const singleDay = isSingleDay(data, xKey);
  const chartRef = useRef(null);

  async function exportChartImage() {
    const root = chartRef.current;
    const svg = root?.querySelector("svg");
    if (!svg) return;

    const rect = root.getBoundingClientRect();
    const width = Math.max(800, Math.round(rect.width || 800));
    const height = Math.max(420, Math.round(rect.height || 420));

    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));

    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", "0");
    bg.setAttribute("y", "0");
    bg.setAttribute("width", "100%");
    bg.setAttribute("height", "100%");
    bg.setAttribute("fill", "#ffffff");
    clone.insertBefore(bg, clone.firstChild);

    const xml = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    try {
      const img = await new Promise((resolve, reject) => {
        const node = new Image();
        node.onload = () => resolve(node);
        node.onerror = reject;
        node.src = url;
      });

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `${String(exportName || title || "chart")
        .replace(/[\\/:*?"<>|]+/g, "-")
        .replace(/\s+/g, "_")}.png`;
      link.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-lg font-bold text-gray-900">{title}</div>
        <div className="flex items-center gap-2">
          {unit ? <div className="text-xs text-gray-500">หน่วย: {unit}</div> : null}
          <Button variant="outline" className="px-3 py-1.5 text-xs" onClick={exportChartImage}>
            ส่งออกรูป
          </Button>
        </div>
      </div>

      {!data || data.length === 0 ? (
        <div className="mt-4 text-sm text-gray-500">ไม่มีข้อมูลในช่วงเวลาที่เลือก</div>
      ) : (
        <div className="mt-3 h-64" ref={chartRef}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey={xKey}
                tickFormatter={(v) => (singleDay ? fmtTime(v) : fmtDateTime(v))}
                minTickGap={25}
              />
              <YAxis />
              <Tooltip
                content={<CustomTooltip valueFormatter={valueFormatter} showDate={!singleDay} />}
              />
              <Line type="monotone" dataKey={dataKey} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
