/****************************************************
 * SmartFarm ESP32 (DHT22 + Soil Moisture + LDR Light + 2 Relay)
 * ✅ Works over HTTPS ngrok (WiFiClientSecure + setInsecure)
 *
 * - POST /api/device/sensor
 * - POST /api/device-status/status
 * - GET  /api/device/commands/poll
 * - POST /api/device/commands/ack
 ****************************************************/

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "DHT.h"

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
const int PIN_LIGHT_ADC = 35;

const int RELAY1_PIN = 26; // pump
const int RELAY2_PIN = 27; // spare
const bool RELAY_ACTIVE_LOW = true; // ถ้ารีเลย์ไม่ทำงานให้ลอง false

// ------------------ Calibration ------------------
int soilDryADC = 3200;
int soilWetADC = 1500;

int lightMinADC = 0;
int lightMaxADC = 4095;

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

// Track ON command id (ack after watering done)
String pendingOnCommandId = "";
String lastCommandId = ""; // ✅ กันรันซ้ำ

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

int lightPercentFromADC(int adc) {
  long pct = map(adc, lightMinADC, lightMaxADC, 0, 100);
  return clampInt((int)pct, 0, 100);
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
  relayWrite(RELAY1_PIN, false);///false
  pumpRunning = true;
  pumpStartedAtMs = millis();
  pumpStopAtMs = millis() + (unsigned long)sec * 1000UL;
  Serial.printf("Pump ON for %d sec\n", sec);
}

void stopPump() {
  relayWrite(RELAY1_PIN, true);///true
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
  doc["fw_version"] = "v1.0.0";
  doc["uptime_sec"] = (int)(millis() / 1000UL);

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
  int lightADC = analogRead(PIN_LIGHT_ADC);

  int soilPct  = soilPercentFromADC(soilADC);
  int lightPct = lightPercentFromADC(lightADC);

  DynamicJsonDocument doc(768);
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

  doc["light_raw_adc"] = lightADC;
  doc["light_percent"] = lightPct;

  String payload;
  serializeJson(doc, payload);

  httpPostJson(EP_SENSOR, payload);

  Serial.printf("SOIL=%d%% adc=%d | LIGHT=%d%% adc=%d\n", soilPct, soilADC, lightPct, lightADC);
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
  Serial.printf("Poll body len=%d\n", body.length());
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

  Serial.printf("Parsed id=%s cmd=%s duration=%d\n", id, cmd, duration);

  if (strlen(id) == 0 || strlen(cmd) == 0) return;

  if (lastCommandId == String(id)) return; // ✅ กันรันซ้ำ
  lastCommandId = String(id);

  String cmdStr = String(cmd);
  Serial.printf("Got command: %s id=%s duration=%d\n", cmdStr.c_str(), id, duration);

  if (cmdStr == "ON") {
    if (!pumpRunning) {
      pendingOnCommandId = id;
      startPumpForSeconds(duration > 0 ? duration : 30);
    }
  } else if (cmdStr == "OFF") {
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

  ensureWiFi();

  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  delay(500);

  testHealth();
}

void loop() {
  ensureWiFi();

  handlePumpAutoStop();
  ackIfOnFinished();

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
