import { useEffect, useMemo, useState } from "react";
import api from "../../services/api.js";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Input from "../../components/ui/Input.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Spinner from "../../components/ui/Spinner.jsx";
import Modal from "../../components/ui/Modal.jsx";
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
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editFarmId, setEditFarmId] = useState("");
  const [editFarmName, setEditFarmName] = useState("");
  const [editDiscord, setEditDiscord] = useState("");
  const [editDiscordOriginal, setEditDiscordOriginal] = useState("");

  const apiBase = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

  function safeFilename(name) {
    return String(name || "farm")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);
  }

  function buildSmartFarmTestCode({ farmId, deviceKey }) {
    return `/*
 * SmartFarm ESP32 (DHT22 + Soil + BH1750 + 2 Relay)
 * Generated for a specific farm.
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "DHT.h"
#include <Wire.h>
#include <BH1750.h>

// WiFi
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

// API
const char* API_BASE   = "${apiBase}";
const char* FARM_ID    = "${farmId}";
const char* DEVICE_KEY = "${deviceKey}";

// Endpoints
String EP_SENSOR = String(API_BASE) + "/device/sensor";
String EP_STATUS = String(API_BASE) + "/device-status/status?farm_id=" + String(FARM_ID);
String EP_POLL   = String(API_BASE) + "/device/commands/poll?farm_id=" + String(FARM_ID) + "&device_key=" + String(DEVICE_KEY);
String EP_ACK    = String(API_BASE) + "/device/commands/ack";
String EP_HEALTH = String(API_BASE) + "/health";

// Pins
#define DHTPIN 4
#define DHTTYPE DHT22
const int PIN_SOIL_ADC  = 34;
const int RELAY1_PIN = 26;
const int RELAY2_PIN = 27;
const bool RELAY_ACTIVE_LOW = true;

// BH1750
BH1750 lightMeter;
bool bhOk = false;
unsigned long lastBhInitMs = 0;
const unsigned long BH_INIT_RETRY_MS = 15000UL;

// Calibration
int soilDryADC = 3200;
int soilWetADC = 1500;

// AUTO config
const int AUTO_ON_PCT = 35;
const int AUTO_WATER_SEC = 15;
const unsigned long AUTO_COOLDOWN_MS = 60UL * 1000UL;
const float AUTO_MAX_LUX = 15000.0;
unsigned long lastAutoWaterMs = 0;

// Timing
unsigned long lastSensorMs = 0;
unsigned long lastStatusMs = 0;
unsigned long lastPollMs   = 0;
unsigned long lastHealthMs = 0;

const unsigned long SENSOR_INTERVAL_MS = 60UL * 1000UL;
const unsigned long STATUS_INTERVAL_MS = 30UL * 1000UL;
const unsigned long POLL_INTERVAL_MS   = 5UL  * 1000UL;
const unsigned long HEALTH_INTERVAL_MS = 10UL * 1000UL;

bool pumpRunning = false;
unsigned long pumpStopAtMs = 0;
unsigned long pumpStartedAtMs = 0;

bool manualActive = false;
String pendingOnCommandId = "";
String lastCommandId = "";

DHT dht(DHTPIN, DHTTYPE);

static inline void relayWrite(int pin, bool on) {
  if (RELAY_ACTIVE_LOW) digitalWrite(pin, on ? LOW : HIGH);
  else digitalWrite(pin, on ? HIGH : LOW);
}

static inline int clampInt(int v, int lo, int hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

static inline float clampFloat(float v, float lo, float hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

int soilPercentFromADC(int adc) {
  long pct = map(adc, soilDryADC, soilWetADC, 0, 100);
  return clampInt((int)pct, 0, 100);
}

int lightPercentFromLux(float lux) {
  long pct = (long)((lux / 20000.0f) * 100.0f);
  return clampInt((int)pct, 0, 100);
}

void i2cScanOnce() {
  int found = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    uint8_t err = Wire.endTransmission();
    if (err == 0) found++;
  }
}

void initBH1750() {
  bhOk = lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);
  lastBhInitMs = millis();
}

void ensureBH1750() {
  if (bhOk) return;
  if (millis() - lastBhInitMs < BH_INIT_RETRY_MS) return;
  initBH1750();
}

float readLuxSafe() {
  ensureBH1750();
  if (!bhOk) return NAN;
  float lux = lightMeter.readLightLevel();
  if (!isfinite(lux) || lux < 0) return NAN;
  return lux;
}

String httpPostJson(const String& url, const String& json) {
  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(12000);

  HTTPClient http;
  http.setTimeout(12000);

  if (!http.begin(client, url)) return "";

  http.addHeader("Content-Type", "application/json");
  http.addHeader("ngrok-skip-browser-warning", "1");

  int code = http.POST((uint8_t*)json.c_str(), json.length());
  String body = http.getString();
  http.end();
  return body;
}

String httpGet(const String& url) {
  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(12000);

  HTTPClient http;
  http.setTimeout(12000);

  if (!http.begin(client, url)) return "";
  http.addHeader("ngrok-skip-browser-warning", "1");

  int code = http.GET();
  String body = http.getString();
  http.end();
  return body;
}

void ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(300);
  }
}

void startPumpForSeconds(int sec) {
  sec = clampInt(sec, 1, 3600);
  relayWrite(RELAY1_PIN, true);
  pumpRunning = true;
  pumpStartedAtMs = millis();
  pumpStopAtMs = millis() + (unsigned long)sec * 1000UL;
}

void stopPump() {
  relayWrite(RELAY1_PIN, false);
  pumpRunning = false;
  pumpStopAtMs = 0;
}

void handlePumpAutoStop() {
  if (pumpRunning && pumpStopAtMs > 0 && millis() >= pumpStopAtMs) stopPump();
}

void testHealth() {
  httpGet(EP_HEALTH);
}

void sendStatus() {
  if (WiFi.status() != WL_CONNECTED) return;
  DynamicJsonDocument doc(512);
  doc["device_key"] = DEVICE_KEY;
  doc["ip"] = WiFi.localIP().toString();
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["pump_state"] = pumpRunning ? "ON" : "OFF";
  doc["fw_version"] = "v1.1.1";
  doc["uptime_sec"] = (int)(millis() / 1000UL);
  doc["bh1750_ok"] = bhOk;

  String payload;
  serializeJson(doc, payload);
  httpPostJson(EP_STATUS, payload);
}

void sendSensor() {
  if (WiFi.status() != WL_CONNECTED) return;

  float t = dht.readTemperature();
  float h = dht.readHumidity();
  bool dhtOk = !(isnan(t) || isnan(h));

  int soilADC  = analogRead(PIN_SOIL_ADC);
  int soilPct  = soilPercentFromADC(soilADC);

  float lux = readLuxSafe();
  bool luxOk = isfinite(lux);
  int lightPct = luxOk ? lightPercentFromLux(lux) : 0;

  DynamicJsonDocument doc(1024);
  doc["farm_id"] = FARM_ID;
  doc["device_key"] = DEVICE_KEY;

  doc["temperature"]  = dhtOk ? (double)clampFloat(t, -20, 80) : 0;
  doc["humidity_air"] = dhtOk ? (double)clampFloat(h, 0, 100) : 0;

  doc["soil_raw_adc"]  = soilADC;
  doc["soil_moisture"] = soilPct;

  if (luxOk) {
    doc["light_lux"] = (double)lux;
    doc["light_percent"] = lightPct;
  } else {
    doc["light_lux"] = nullptr;
    doc["light_percent"] = nullptr;
  }

  doc["pump_running"] = pumpRunning;
  doc["mode"] = manualActive ? "MANUAL" : "AUTO";

  String payload;
  serializeJson(doc, payload);
  httpPostJson(EP_SENSOR, payload);
}

void sendAck(const char* commandId, const char* status, int actualDurationSec) {
  if (!commandId || !commandId[0]) return;
  DynamicJsonDocument ack(256);
  ack["farm_id"] = FARM_ID;
  ack["device_key"] = DEVICE_KEY;
  ack["command_id"] = commandId;
  ack["status"] = status;
  ack["actual_duration_sec"] = actualDurationSec;
  String payload;
  serializeJson(ack, payload);
  httpPostJson(EP_ACK, payload);
}

void pollCommands() {
  if (WiFi.status() != WL_CONNECTED) return;
  String body = httpGet(EP_POLL);
  if (body.length() < 5) return;

  StaticJsonDocument<2048> doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) return;

  const char* id  = doc["_id"] | "";
  const char* cmd = doc["command"] | "";
  int duration = doc["duration_sec"] | 0;

  if (strlen(id) == 0 || strlen(cmd) == 0) return;
  if (lastCommandId == String(id)) return;
  lastCommandId = String(id);

  String cmdStr = String(cmd);
  if (cmdStr == "ON") {
    manualActive = true;
    if (!pumpRunning) {
      pendingOnCommandId = id;
      startPumpForSeconds(duration > 0 ? duration : 30);
    }
  } else if (cmdStr == "OFF") {
    manualActive = false;
    stopPump();
    sendAck(id, "done", 0);
  } else {
    sendAck(id, "failed", 0);
  }
}

void ackIfOnFinished() {
  if (pendingOnCommandId.length() == 0) return;
  if (pumpRunning) return;
  unsigned long durMs = 0;
  if (pumpStartedAtMs > 0) durMs = millis() - pumpStartedAtMs;
  int actualSec = (int)(durMs / 1000UL);
  if (actualSec <= 0) actualSec = 1;

  sendAck(pendingOnCommandId.c_str(), "done", actualSec);
  pendingOnCommandId = "";
  pumpStartedAtMs = 0;
  manualActive = false;
}

void autoWateringStep() {
  if (manualActive || pumpRunning) return;
  if ((millis() - lastAutoWaterMs) < AUTO_COOLDOWN_MS) return;

  int soilADC  = analogRead(PIN_SOIL_ADC);
  int soilPct  = soilPercentFromADC(soilADC);

  float lux = readLuxSafe();
  bool luxOk = isfinite(lux);
  if (luxOk && lux > AUTO_MAX_LUX) return;

  if (soilPct <= AUTO_ON_PCT) {
    lastAutoWaterMs = millis();
    startPumpForSeconds(AUTO_WATER_SEC);
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(RELAY1_PIN, OUTPUT);
  pinMode(RELAY2_PIN, OUTPUT);
  relayWrite(RELAY1_PIN, false);
  relayWrite(RELAY2_PIN, false);

  analogReadResolution(12);
  dht.begin();

  Wire.begin(21, 22);
  delay(100);
  i2cScanOnce();
  initBH1750();

  ensureWiFi();
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  delay(500);
  testHealth();
}

void loop() {
  ensureWiFi();

  handlePumpAutoStop();
  ackIfOnFinished();
  autoWateringStep();

  unsigned long now = millis();

  if (now - lastHealthMs >= HEALTH_INTERVAL_MS) {
    lastHealthMs = now;
    testHealth();
  }
  if (now - lastStatusMs >= STATUS_INTERVAL_MS) {
    lastStatusMs = now;
    sendStatus();
  }
  if (now - lastSensorMs >= SENSOR_INTERVAL_MS) {
    lastSensorMs = now;
    sendSensor();
  }
  if (now - lastPollMs >= POLL_INTERVAL_MS) {
    lastPollMs = now;
    pollCommands();
  }
  delay(10);
}
`;
  }

  async function downloadFarmCode(farm) {
    try {
      const farmId = String(farm._id);
      const settingsRes = await api.get(`/settings/my?farm_id=${encodeURIComponent(farmId)}`);
      let settings = settingsRes.data || null;

      if (!settings?.device_key) {
        const created = await api.post(`/settings/my?farm_id=${encodeURIComponent(farmId)}`, {});
        settings = created.data || settings;
      }

      if (!settings?.device_key) {
        toast.error("ไม่พบรหัสอุปกรณ์ กรุณาบันทึกตั้งค่าฟาร์มก่อน");
        return;
      }

      const code = buildSmartFarmTestCode({
        farmId,
        deviceKey: String(settings.device_key),
      });

      const filename = `${safeFilename(farm.farm_name || farmId)}_Smart_farm_test.ino`;
      const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e?.message || "ดาวน์โหลดไม่สำเร็จ");
    }
  }

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
    try {
      const farmId = String(f._id);
      const discordRes = await api.get(`/admin/farms/${encodeURIComponent(farmId)}/discord-webhook`);
      const currentDiscord = String(discordRes?.data?.discord_webhook_url || "");
      setEditFarmId(farmId);
      setEditFarmName(String(f.farm_name || ""));
      setEditDiscord(currentDiscord);
      setEditDiscordOriginal(currentDiscord);
      setEditOpen(true);
    } catch (e) {
      toast.error(e?.message || "อัปเดตไม่สำเร็จ");
    }
  }

  async function saveEdit() {
    const nameTrim = String(editFarmName || "").trim();
    const discordTrim = String(editDiscord || "").trim();

    if (!nameTrim) return toast.error("กรุณากรอกชื่อฟาร์ม");
    if (discordTrim && !discordTrim.startsWith("https://discord.com/api/webhooks/")) {
      return toast.error("ลิงก์ Discord Webhook ไม่ถูกต้อง");
    }

    try {
      setEditSaving(true);
      await api.put(`/farms/${editFarmId}`, { farm_name: nameTrim });
      await api.post(`/admin/farms/${encodeURIComponent(editFarmId)}/discord-webhook`, {
        discord_webhook_url: discordTrim,
        discord_enabled: Boolean(discordTrim),
      });
      setEditOpen(false);
      toast.success("อัปเดตชื่อฟาร์มและลิงก์ Discord แล้ว");
      await load();
    } catch (e) {
      toast.error(e?.message || "อัปเดตไม่สำเร็จ");
    } finally {
      setEditSaving(false);
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
          <h1 className="text-2xl font-semibold">ฟาร์ม</h1>
          <p className="text-sm opacity-70">จัดการข้อมูลฟาร์มสำหรับระบบปลูกผักบุ้ง</p>
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
                    ผู้ใช้งาน: {renderFarmUsers(String(f._id))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => downloadFarmCode(f)}>
                    ดาวน์โหลดโค้ด
                  </Button>
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

      <Modal open={editOpen} title="แก้ไขฟาร์ม" onClose={() => !editSaving && setEditOpen(false)}>
        <div className="space-y-3">
          <div>
            <div className="text-sm mb-1">ชื่อฟาร์ม</div>
            <Input
              value={editFarmName}
              onChange={(e) => setEditFarmName(e.target.value)}
              placeholder="ชื่อฟาร์ม"
            />
          </div>

          <div>
            <div className="text-sm mb-1">ลิงก์ Discord เดิม</div>
            <div className="text-xs rounded-md border bg-gray-50 px-3 py-2 break-all">
              {editDiscordOriginal || "-"}
            </div>
          </div>

          <div>
            <div className="text-sm mb-1">Discord Webhook (เว้นว่างได้)</div>
            <Input
              value={editDiscord}
              onChange={(e) => setEditDiscord(e.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving}>
              ยกเลิก
            </Button>
            <Button onClick={saveEdit} disabled={editSaving}>
              {editSaving ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
