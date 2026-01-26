/****************************************************
 * SmartFarm ESP32 (DHT22 + Soil Analog + BH1750 + 2 Relay)
 * ✅ Works over HTTPS ngrok (WiFiClientSecure + setInsecure)
 *
 * Endpoints (ตาม backend เดิมของคุณ):
 * - POST /api/device/sensor
 * - POST /api/device-status/status?farm_id=...
 * - GET  /api/device/commands/poll?farm_id=...&device_key=...
 * - POST /api/device/commands/ack
 ****************************************************/

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "DHT.h"
#include <Wire.h>
#include <BH1750.h>

// ------------------ WiFi ------------------
const char* WIFI_SSID = "Gggg";
const char* WIFI_PASS = "12345678";

// ------------------ API (ngrok) ------------------
const char* API_BASE   = "https://thermostable-bankerly-angelia.ngrok-free.dev/api";
const char* FARM_ID    = "694f46c2707b1b7026839ae2";
const char* DEVICE_KEY = "123456789";

// Endpoints
String EP_SENSOR = String(API_BASE) + "/device/sensor";
String EP_STATUS = String(API_BASE) + "/device-status/status?farm_id=" + String(FARM_ID);
String EP_POLL   = String(API_BASE) + "/device/commands/poll?farm_id=" + String(FARM_ID) + "&device_key=" + String(DEVICE_KEY);
String EP_ACK    = String(API_BASE) + "/device/commands/ack";
String EP_HEALTH = String(API_BASE) + "/health";

// ------------------ Pins ------------------
#define DHTPIN 4
#define DHTTYPE DHT22

const int PIN_SOIL_ADC  = 34;

const int RELAY1_PIN = 26; // pump
const int RELAY2_PIN = 27; // spare
const bool RELAY_ACTIVE_LOW = true; // ถ้ารีเลย์ทำงานกลับด้าน ให้สลับค่า

// ------------------ BH1750 (I2C) ------------------
BH1750 lightMeter;
bool bhOk = false;                         // ✅ NEW: BH1750 ready flag
unsigned long lastBhInitMs = 0;            // ✅ NEW: retry init
const unsigned long BH_INIT_RETRY_MS = 15000UL;

// ------------------ Calibration (soil) ------------------
int soilDryADC = 3200;
int soilWetADC = 1500;

// ------------------ AUTO config (ผักบุ้งจีน) ------------------
const int AUTO_ON_PCT = 35;                 // ≤35% = แห้ง
const int AUTO_WATER_SEC = 15;              // รดครั้งละ 15 วิ
const unsigned long AUTO_COOLDOWN_MS = 60UL * 1000UL; // เว้น 60 วิ
const float AUTO_MAX_LUX = 15000.0;         // ถ้าแดดแรงกว่า 15000 lux งดรด
unsigned long lastAutoWaterMs = 0;

// ------------------ Timing ------------------
unsigned long lastSensorMs = 0;
unsigned long lastStatusMs = 0;
unsigned long lastPollMs   = 0;
unsigned long lastHealthMs = 0;

const unsigned long SENSOR_INTERVAL_MS = 60UL * 1000UL;
const unsigned long STATUS_INTERVAL_MS = 30UL * 1000UL;
const unsigned long POLL_INTERVAL_MS   = 5UL  * 1000UL;
const unsigned long HEALTH_INTERVAL_MS = 10UL * 1000UL;

// Pump runtime
bool pumpRunning = false;
unsigned long pumpStopAtMs = 0;
unsigned long pumpStartedAtMs = 0;

// MANUAL tracking
bool manualActive = false;          // true เมื่อมีคำสั่งจากเว็บ / กำลังรันตามคำสั่ง
String pendingOnCommandId = "";
String lastCommandId = "";          // กันรันซ้ำ

// DHT
DHT dht(DHTPIN, DHTTYPE);

// ------------------ Utils ------------------
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

// lux -> percent (เผื่อหน้าเว็บเดิมใช้ light_percent)
int lightPercentFromLux(float lux) {
  long pct = (long)((lux / 20000.0f) * 100.0f);
  return clampInt((int)pct, 0, 100);
}

// ------------------ I2C scan (ช่วยเช็ค ADDR=LOW => 0x23) ------------------
void i2cScanOnce() {
  Serial.println("I2C scan...");
  int found = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    uint8_t err = Wire.endTransmission();
    if (err == 0) {
      Serial.print("  Found: 0x");
      Serial.println(addr, HEX);
      found++;
    }
  }
  if (!found) Serial.println("  (No I2C devices found)");
}

// ------------------ BH1750 init/read ------------------
void initBH1750() {
  // ADDR=LOW: ปกติคือ 0x23 และ begin(mode) จะใช้ default address อยู่แล้ว
  bhOk = lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);
  lastBhInitMs = millis();

  if (bhOk) Serial.println("[BH1750] OK (ADDR=LOW ~0x23)");
  else Serial.println("[BH1750] begin() failed -> wiring/I2C/address problem");
}

void ensureBH1750() {
  if (bhOk) return;
  if (millis() - lastBhInitMs < BH_INIT_RETRY_MS) return;
  Serial.println("[BH1750] retry init...");
  initBH1750();
}

// อ่าน lux แบบปลอดภัย: ถ้า BH ไม่พร้อม -> return NAN
float readLuxSafe() {
  ensureBH1750();
  if (!bhOk) return NAN;

  float lux = lightMeter.readLightLevel();

  // กันค่าพัง (ติดลบ/NaN)
  if (!isfinite(lux) || lux < 0) return NAN;

  return lux;
}

// ------------------ HTTPS helpers ------------------
String httpPostJson(const String& url, const String& json) {
  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(12000);

  HTTPClient http;
  http.setTimeout(12000);

  if (!http.begin(client, url)) {
    Serial.printf("[POST] begin() failed: %s\n", url.c_str());
    return "";
  }

  http.addHeader("Content-Type", "application/json");
  // ✅ NEW: ngrok skip warning (ช่วยให้ไม่โดนหน้า HTML)
  http.addHeader("ngrok-skip-browser-warning", "1");

  int code = http.POST((uint8_t*)json.c_str(), json.length());
  String body = http.getString();

  Serial.printf("[POST] %s -> %d\n", url.c_str(), code);
  if (code < 0) {
    Serial.printf("HTTPClient error: %s\n", http.errorToString(code).c_str());
  } else if (code < 200 || code >= 300) {
    Serial.printf("Body: %s\n", body.c_str());
  }

  http.end();
  return body;
}

String httpGet(const String& url) {
  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(12000);

  HTTPClient http;
  http.setTimeout(12000);

  if (!http.begin(client, url)) {
    Serial.printf("[GET] begin() failed: %s\n", url.c_str());
    return "";
  }

  // ✅ NEW: ngrok skip warning
  http.addHeader("ngrok-skip-browser-warning", "1");

  int code = http.GET();
  String body = http.getString();

  Serial.printf("[GET] %s -> %d\n", url.c_str(), code);
  if (code < 0) {
    Serial.printf("HTTPClient error: %s\n", http.errorToString(code).c_str());
  } else if (code < 200 || code >= 300) {
    Serial.printf("Body: %s\n", body.c_str());
  }

  http.end();
  return body;
}

// ------------------ WiFi ------------------
void ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.printf("Connecting WiFi: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi OK: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi FAIL");
  }
}

// ------------------ Pump control ------------------
void startPumpForSeconds(int sec) {
  sec = clampInt(sec, 1, 3600);
  relayWrite(RELAY1_PIN, true);
  pumpRunning = true;
  pumpStartedAtMs = millis();
  pumpStopAtMs = millis() + (unsigned long)sec * 1000UL;
  Serial.printf("Pump ON for %d sec\n", sec);
}

void stopPump() {
  relayWrite(RELAY1_PIN, false);
  pumpRunning = false;
  pumpStopAtMs = 0;
  Serial.println("Pump OFF");
}

void handlePumpAutoStop() {
  if (pumpRunning && pumpStopAtMs > 0 && millis() >= pumpStopAtMs) stopPump();
}

// ------------------ API Actions ------------------
void testHealth() {
  String body = httpGet(EP_HEALTH);
  Serial.printf("Health body: %s\n", body.c_str());
}

void sendStatus() {
  if (WiFi.status() != WL_CONNECTED) return;

  DynamicJsonDocument doc(512);
  doc["device_key"] = DEVICE_KEY;
  doc["ip"] = WiFi.localIP().toString();
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["pump_state"] = pumpRunning ? "ON" : "OFF";
  doc["fw_version"] = "v1.1.1"; // ✅ bump
  doc["uptime_sec"] = (int)(millis() / 1000UL);

  // ✅ ส่งสถานะ BH1750 ด้วย จะได้รู้ว่า sensor พร้อมไหม
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
  if (!dhtOk) Serial.println("DHT read failed");

  int soilADC  = analogRead(PIN_SOIL_ADC);
  int soilPct  = soilPercentFromADC(soilADC);

  // ✅ ใช้ safe read
  float lux = readLuxSafe();
  bool luxOk = isfinite(lux);
  int lightPct = luxOk ? lightPercentFromLux(lux) : 0;

  DynamicJsonDocument doc(1024);
  doc["farm_id"] = FARM_ID;
  doc["device_key"] = DEVICE_KEY;

  if (dhtOk) {
    doc["temperature"]  = (double)clampFloat(t, -20, 80);
    doc["humidity_air"] = (double)clampFloat(h, 0, 100);
  } else {
    doc["temperature"]  = 0;
    doc["humidity_air"] = 0;
  }

  doc["soil_raw_adc"]  = soilADC;
  doc["soil_moisture"] = soilPct;

  // ✅ ส่ง lux เฉพาะเมื่ออ่านได้จริง (ไม่ส่ง -2)
  if (luxOk) {
    doc["light_lux"] = (double)lux;
    doc["light_percent"] = lightPct;
  } else {
    // จะส่งเป็น null เพื่อให้ backend/เว็บรู้ว่าอ่านไม่ได้
    doc["light_lux"] = nullptr;
    doc["light_percent"] = nullptr;
  }

  doc["pump_running"] = pumpRunning;
  doc["mode"] = manualActive ? "MANUAL" : "AUTO";

  String payload;
  serializeJson(doc, payload);

  httpPostJson(EP_SENSOR, payload);

  Serial.printf("SOIL=%d%% adc=%d | LUX=%s | MODE=%s | PUMP=%s | BH=%s\n",
    soilPct, soilADC,
    luxOk ? String(lux, 0).c_str() : "N/A",
    manualActive ? "MANUAL" : "AUTO",
    pumpRunning ? "ON" : "OFF",
    bhOk ? "OK" : "FAIL"
  );
}

void sendAck(const char* commandId, const char* status, int actualDurationSec) {
  if (!commandId || !commandId[0]) return;

  DynamicJsonDocument ack(256);
  ack["farm_id"] = FARM_ID;
  ack["device_key"] = DEVICE_KEY;
  ack["command_id"] = commandId;
  ack["status"] = status; // "done" | "failed"
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
  if (err) {
    Serial.printf("JSON error: %s\n", err.c_str());
    return;
  }

  const char* id  = doc["_id"] | "";
  const char* cmd = doc["command"] | "";
  int duration = doc["duration_sec"] | 0;

  if (strlen(id) == 0 || strlen(cmd) == 0) return;

  if (lastCommandId == String(id)) return;
  lastCommandId = String(id);

  String cmdStr = String(cmd);
  Serial.printf("Got command: %s id=%s duration=%d\n", cmdStr.c_str(), id, duration);

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

// ------------------ AUTO logic ------------------
void autoWateringStep() {
  if (manualActive || pumpRunning) return;
  if ((millis() - lastAutoWaterMs) < AUTO_COOLDOWN_MS) return;

  int soilADC  = analogRead(PIN_SOIL_ADC);
  int soilPct  = soilPercentFromADC(soilADC);

  float lux = readLuxSafe();
  bool luxOk = isfinite(lux);

  // ✅ ถ้าอ่าน lux ไม่ได้: อย่าใช้ lux เป็นเงื่อนไขงดรด (เลือกนโยบาย)
  // ที่นี่ผมเลือก "ถ้า lux ไม่ได้ -> ไม่งดด้วย lux"
  if (luxOk && lux > AUTO_MAX_LUX) {
    Serial.printf("[AUTO] Skip (lux %.0f > %.0f)\n", lux, AUTO_MAX_LUX);
    return;
  }

  if (soilPct <= AUTO_ON_PCT) {
    lastAutoWaterMs = millis();
    startPumpForSeconds(AUTO_WATER_SEC);
    Serial.printf("[AUTO] Soil %d%% -> Water %d sec (lux %s)\n",
                  soilPct, AUTO_WATER_SEC,
                  luxOk ? String(lux, 0).c_str() : "N/A");
  }
}

// ------------------ Setup/Loop ------------------
void setup() {
  Serial.begin(115200);

  pinMode(RELAY1_PIN, OUTPUT);
  pinMode(RELAY2_PIN, OUTPUT);
  relayWrite(RELAY1_PIN, false);
  relayWrite(RELAY2_PIN, false);

  analogReadResolution(12);
  dht.begin();

  // ✅ I2C init + scan + BH init
  Wire.begin(21, 22);
  delay(100);
  i2cScanOnce();      // ✅ จะเห็น 0x23 ถ้า ADDR=LOW ต่อถูก
  initBH1750();       // ✅ ตั้ง bhOk

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
