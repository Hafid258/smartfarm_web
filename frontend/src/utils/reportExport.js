import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

function fmt(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "-";
  return Number(n).toFixed(digits);
}

export function exportReportExcel(report, period = "day") {
  if (!report) return;

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      {
        ช่วงรายงาน: report.label,
        เริ่มต้น: report.start,
        สิ้นสุด: report.end,
        จำนวนครั้งรดน้ำ: report.summary?.watering_count ?? 0,
        จำนวนครั้งพ่นหมอก: report.summary?.mist_count ?? 0,
        อุณหภูมิเฉลี่ย: report.summary?.avg_temperature ?? "",
        ความชื้นเฉลี่ย: report.summary?.avg_humidity_air ?? "",
        แสงเฉลี่ย: report.summary?.avg_light_lux ?? "",
        จำนวนตัวอย่างเซนเซอร์: report.summary?.sensor_samples ?? 0,
      },
    ]),
    "Summary"
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      (report.command_breakdown || []).map((row) => ({
        ประเภทการสั่ง: row.trigger_mode === "auto" ? "ระบบสั่งเอง" : "สั่งมือ",
        แหล่งที่มา: row.source,
        อุปกรณ์: row.device_id,
        คำสั่ง: row.command,
        จำนวน: row.count,
      }))
    ),
    "Breakdown"
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      (report.commands || []).map((row) => ({
        เวลา: row.timestamp ? new Date(row.timestamp).toLocaleString() : "-",
        อุปกรณ์: row.device_id,
        คำสั่ง: row.command,
        ระยะเวลา: row.duration_sec,
        คนสั่ง: row.actor_name,
        ประเภทการสั่ง: row.trigger_mode === "auto" ? "ระบบสั่งเอง" : "สั่งมือ",
        สถานะ: row.status,
      }))
    ),
    "Commands"
  );

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  saveAs(new Blob([buf], { type: "application/octet-stream" }), `smartfarm_report_${period}.xlsx`);
}

export function exportReportPdf(report, { farmName = "SmartFarm", period = "day" } = {}) {
  if (!report) return false;

  const html = `
    <html>
      <head>
        <title>SmartFarm Report</title>
        <style>
          @page { size: A4; margin: 14mm; }
          * { box-sizing: border-box; }
          body {
            font-family: Arial, sans-serif;
            color: #0f172a;
            margin: 0;
            background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
          }
          .page {
            padding: 20px;
            border: 1px solid #dbeafe;
            border-radius: 24px;
            background: #ffffff;
          }
          .hero {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
            padding: 20px;
            border-radius: 20px;
            background: linear-gradient(135deg, #0f172a 0%, #0f766e 100%);
            color: #ffffff;
          }
          .hero h1 { margin: 0 0 8px; font-size: 26px; }
          .hero .meta { font-size: 13px; color: rgba(255,255,255,0.82); }
          .badge {
            display: inline-block;
            padding: 8px 14px;
            border-radius: 999px;
            background: rgba(255,255,255,0.14);
            font-size: 12px;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
            margin: 18px 0;
          }
          .card {
            border: 1px solid #dbeafe;
            border-radius: 18px;
            padding: 14px;
            background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
          }
          .card .label { font-size: 12px; color: #475569; }
          .card .value { margin-top: 8px; font-size: 24px; font-weight: 700; }
          h2 { margin: 24px 0 10px; font-size: 18px; }
          table {
            width: 100%;
            border-collapse: collapse;
            overflow: hidden;
            border-radius: 16px;
            border: 1px solid #dbeafe;
          }
          th, td {
            padding: 10px 12px;
            border-bottom: 1px solid #e2e8f0;
            text-align: left;
            font-size: 12px;
            vertical-align: top;
          }
          th {
            background: #eff6ff;
            color: #1e3a8a;
          }
          tr:last-child td { border-bottom: none; }
          .muted { color: #64748b; }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="hero">
            <div>
              <h1>SmartFarm Report</h1>
              <div class="meta">ฟาร์ม: ${farmName}</div>
              <div class="meta">ช่วงรายงาน: ${report.label}</div>
              <div class="meta">ช่วงเวลา: ${new Date(report.start).toLocaleString()} - ${new Date(report.end).toLocaleString()}</div>
            </div>
            <div class="badge">${period.toUpperCase()}</div>
          </div>

          <div class="grid">
            <div class="card"><div class="label">จำนวนครั้งรดน้ำ</div><div class="value">${report.summary?.watering_count ?? 0}</div><div class="muted">ครั้ง</div></div>
            <div class="card"><div class="label">จำนวนครั้งพ่นหมอก</div><div class="value">${report.summary?.mist_count ?? 0}</div><div class="muted">ครั้ง</div></div>
            <div class="card"><div class="label">อุณหภูมิเฉลี่ย</div><div class="value">${fmt(report.summary?.avg_temperature, 1)}</div><div class="muted">C</div></div>
            <div class="card"><div class="label">ความชื้นเฉลี่ย</div><div class="value">${fmt(report.summary?.avg_humidity_air, 1)}</div><div class="muted">%</div></div>
            <div class="card"><div class="label">แสงเฉลี่ย</div><div class="value">${fmt(report.summary?.avg_light_lux, 0)}</div><div class="muted">lux</div></div>
            <div class="card"><div class="label">จำนวนตัวอย่างเซนเซอร์</div><div class="value">${report.summary?.sensor_samples ?? 0}</div><div class="muted">sample</div></div>
          </div>

          <h2>สรุปการสั่งงาน</h2>
          <table>
            <thead>
              <tr><th>ประเภท</th><th>แหล่งที่มา</th><th>อุปกรณ์</th><th>คำสั่ง</th><th>จำนวน</th></tr>
            </thead>
            <tbody>
              ${(report.command_breakdown || []).map((row) => `
                <tr>
                  <td>${row.trigger_mode === "auto" ? "ระบบสั่งเอง" : "สั่งมือ"}</td>
                  <td>${row.source}</td>
                  <td>${row.device_id}</td>
                  <td>${row.command}</td>
                  <td>${row.count}</td>
                </tr>
              `).join("") || '<tr><td colspan="5">ไม่มีข้อมูล</td></tr>'}
            </tbody>
          </table>

          <h2>ประวัติคำสั่งล่าสุด</h2>
          <table>
            <thead>
              <tr><th>เวลา</th><th>อุปกรณ์</th><th>คำสั่ง</th><th>คนสั่ง</th><th>ประเภท</th><th>สถานะ</th></tr>
            </thead>
            <tbody>
              ${(report.commands || []).slice(0, 20).map((row) => `
                <tr>
                  <td>${row.timestamp ? new Date(row.timestamp).toLocaleString() : "-"}</td>
                  <td>${row.device_id || "-"}</td>
                  <td>${row.command || "-"}</td>
                  <td>${row.actor_name || "-"}</td>
                  <td>${row.trigger_mode === "auto" ? "ระบบสั่งเอง" : "สั่งมือ"}</td>
                  <td>${row.status || "-"}</td>
                </tr>
              `).join("") || '<tr><td colspan="6">ไม่มีข้อมูล</td></tr>'}
            </tbody>
          </table>
        </div>
      </body>
    </html>
  `;

  const win = window.open("", "_blank", "width=1200,height=900");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
  return true;
}
