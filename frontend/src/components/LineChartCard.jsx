import Card from "./ui/Card.jsx";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

/**
 * ✅ แปลง timestamp → Date
 */
function toDate(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * ✅ format เวลา HH:mm
 */
function fmtTime(ts) {
  const d = toDate(ts);
  if (!d) return "-";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * ✅ format วัน + เวลา (MM/DD HH:mm)
 */
function fmtDateTime(ts) {
  const d = toDate(ts);
  if (!d) return "-";
  const M = String(d.getMonth() + 1).padStart(2, "0");
  const D = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${M}/${D} ${hh}:${mm}`;
}

/**
 * ✅ ตรวจว่า data อยู่ในวันเดียวกันไหม
 * ถ้าอยู่วันเดียวกัน -> แสดงแค่เวลา
 * ถ้าหลายวัน -> แสดงวัน+เวลา
 */
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

/**
 * ✅ Tooltip Custom
 */
function CustomTooltip({ active, payload, label, valueFormatter, showDate }) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value;

  return (
    <div className="bg-white border rounded-xl shadow p-3 text-sm">
      <div className="font-semibold text-gray-900">
        {showDate ? fmtDateTime(label) : fmtTime(label)}
      </div>
      <div className="text-gray-700 mt-1">
        ค่า: <b>{valueFormatter ? valueFormatter(v) : v}</b>
      </div>
    </div>
  );
}

/**
 * ✅ LineChartCard
 * props:
 * - title
 * - data
 * - dataKey (ค่าที่จะ plot)
 * - xKey (default timestamp)
 * - unit (optional)
 * - valueFormatter (optional)
 */
export default function LineChartCard({
  title,
  data = [],
  dataKey,
  xKey = "timestamp",
  unit = "",
  valueFormatter,
}) {
  const singleDay = isSingleDay(data, xKey);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="text-lg font-bold text-gray-900">{title}</div>
        {unit ? (
          <div className="text-xs text-gray-500">หน่วย: {unit}</div>
        ) : null}
      </div>

      {!data || data.length === 0 ? (
        <div className="text-sm text-gray-500 mt-4">
          ไม่มีข้อมูลในช่วงเวลาที่เลือก
        </div>
      ) : (
        <div className="h-64 mt-3">
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
                content={
                  <CustomTooltip
                    valueFormatter={valueFormatter}
                    showDate={!singleDay}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey={dataKey}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
