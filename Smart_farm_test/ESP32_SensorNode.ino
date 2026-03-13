/****************************************************
 * SmartFarm ESP32 Sensor Node (DHT22 + Soil + BH1750)
 * Split mode: this node only sends sensor + status
 * Compatible with backend role-based keys
 ****************************************************/

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "DHT.h"
#include <Wire.h>
#include <BH1750.h>
#include <esp_system.h>

// ------------------ WiFi ------------------
const char* WIFI_SSID = "SUDOFARM4G";
const char* WIFI_PASS = "1234567890";

// ------------------ API ------------------
String apiBase = "https://smartfarm-backend-i46a.vercel.app/api";
const char* FARM_ID    = "697b7012a25c6b8336c8f51e";
const char* DEVICE_KEY = "YOUR_SENSOR_DEVICE_KEY";

String EP_SENSOR;
String EP_STATUS;

// ------------------ Pins ------------------
#define DHTPIN 4
#define DHTTYPE DHT22
const int PIN_SOIL_ADC = 34;

// ------------------ BH1750 ------------------
BH1750 lightMeter;
bool bhOk = false;
unsigned long lastBhInitMs = 0;
const unsigned long BH_INIT_RETRY_MS = 15000UL;

// ------------------ Calibration ------------------
int soilDryADC = 3200;
int soilWetADC = 1500;

// ------------------ Timing ------------------
unsigned long lastSensorMs = 0;
unsigned long lastStatusMs = 0;
const unsigned long SENSOR_INTERVAL_MS = 60UL * 1000UL;
const unsigned long STATUS_INTERVAL_MS = 60UL * 1000UL;

// ------------------ Network backoff ------------------
unsigned long nextNetAllowedMs = 0;
unsigned long netBackoffMs = 0;
const unsigned long NET_BACKOFF_BASE_MS = 3000UL;
const unsigned long NET_BACKOFF_MAX_MS  = 30000UL;
unsigned int netFailStreak = 0;
unsigned long lastNetFailMs = 0;
unsigned long lastRecoverAttemptMs = 0;
const unsigned int NET_FAIL_RECONNECT_THRESHOLD = 3;
const unsigned int NET_FAIL_RESTART_THRESHOLD = 10;
const unsigned long NET_RECOVER_COOLDOWN_MS = 15000UL;
const unsigned long NET_FAIL_WINDOW_MS = 120000UL;

// ------------------ DHT cache/retry ------------------
DHT dht(DHTPIN, DHTTYPE);
bool hasLastDht = false;
float lastGoodTemp = 30.0f;
float lastGoodHum = 60.0f;
unsigned long lastDhtAttemptMs = 0;
const unsigned long DHT_RETRY_NO_CACHE_MS = 10000UL;
const unsigned long DHT_RETRY_WITH_CACHE_MS = 180000UL;
unsigned int dhtFailStreak = 0;
unsigned long lastDhtReinitMs = 0;
const unsigned int DHT_REINIT_THRESHOLD = 3;
const unsigned long DHT_REINIT_COOLDOWN_MS = 15000UL;

bool netAllowed() {
  return millis() >= nextNetAllowedMs;
}

void noteNetSuccess() {
  netBackoffMs = 0;
  nextNetAllowedMs = 0;
  netFailStreak = 0;
  lastNetFailMs = 0;
}

void noteNetFailure() {
  netFailStreak++;
  lastNetFailMs = millis();
  if (netBackoffMs == 0) netBackoffMs = NET_BACKOFF_BASE_MS;
  else netBackoffMs = (unsigned long)min((uint32_t)NET_BACKOFF_MAX_MS, (uint32_t)(netBackoffMs * 2UL));
  nextNetAllowedMs = millis() + netBackoffMs;
  Serial.printf("[NET] backoff %lu ms (fail streak=%u)\n", netBackoffMs, netFailStreak);
}

void handleNetworkAutoRecover() {
  if (netFailStreak == 0) return;
  if (millis() - lastRecoverAttemptMs < NET_RECOVER_COOLDOWN_MS) return;

  if (netFailStreak >= NET_FAIL_RESTART_THRESHOLD &&
      lastNetFailMs > 0 &&
      (millis() - lastNetFailMs) <= NET_FAIL_WINDOW_MS) {
    Serial.printf("[NET] fail streak=%u within %lu ms -> ESP restart\n", netFailStreak, NET_FAIL_WINDOW_MS);
    delay(200);
    ESP.restart();
    return;
  }

  if (netFailStreak >= NET_FAIL_RECONNECT_THRESHOLD) {
    lastRecoverAttemptMs = millis();
    Serial.printf("[NET] fail streak=%u -> force WiFi reconnect\n", netFailStreak);
    WiFi.disconnect(true, true);
    delay(200);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASS);
  }
}

void buildEndpoints() {
  EP_SENSOR = apiBase + "/device/sensor?farm_id=" + String(FARM_ID) + "&device_key=" + String(DEVICE_KEY);
  EP_STATUS = apiBase + "/device-status/status?farm_id=" + String(FARM_ID) + "&device_key=" + String(DEVICE_KEY);
}

static inline int clampInt(int v, int lo, int hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

static inline float clampFloat(float v, float lo, float hi) {
  if (!isfinite(v)) return lo;
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

void initBH1750() {
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

float readLuxSafe() {
  ensureBH1750();
  if (!bhOk) return NAN;
  float lux = lightMeter.readLightLevel();
  if (!isfinite(lux) || lux < 0) return NAN;
  return lux;
}

int httpPostJson(const String& url, const String& json) {
  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(12000);

  HTTPClient http;
  http.setTimeout(12000);

  if (!http.begin(client, url)) {
    Serial.printf("[POST] begin() failed: %s\n", url.c_str());
    noteNetFailure();
    return -1;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("ngrok-skip-browser-warning", "1");

  int code = http.POST(json);
  String body = http.getString();
  Serial.printf("[POST] %s -> %d (len=%u)\n", url.c_str(), code, (unsigned)json.length());

  if (code < 0) {
    Serial.printf("HTTPClient error: %s\n", http.errorToString(code).c_str());
    noteNetFailure();
  } else if (code < 200 || code >= 300) {
    Serial.printf("Body: %s\n", body.c_str());
    if (code >= 500) noteNetFailure();
    else noteNetSuccess();
  } else {
    noteNetSuccess();
  }

  http.end();
  return code;
}

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

void sendStatus() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (!netAllowed()) return;

  DynamicJsonDocument doc(512);
  doc["farm_id"] = FARM_ID;
  doc["device_key"] = String(DEVICE_KEY);
  doc["device_role"] = "sensor";
  doc["ip"] = WiFi.localIP().toString();
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["fw_version"] = "sensor-v1.1.1";
  doc["uptime_sec"] = (int)(millis() / 1000UL);
  doc["dht_ok"] = (dhtFailStreak == 0);
  doc["soil_ok"] = true;
  doc["light_ok"] = bhOk;
  doc["bh1750_ok"] = bhOk;

  String payload;
  serializeJson(doc, payload);
  if (doc.overflowed() || payload.indexOf("\"device_key\"") < 0) {
    Serial.println("[STATUS] invalid JSON payload (missing device_key/overflow), skip send");
    return;
  }

  httpPostJson(EP_STATUS, payload);
}

bool sendSensor() {
  if (WiFi.status() != WL_CONNECTED) return false;
  if (!netAllowed()) return false;

  float t = NAN;
  float h = NAN;
  bool dhtOk = false;

  unsigned long retryWindow = hasLastDht ? DHT_RETRY_WITH_CACHE_MS : DHT_RETRY_NO_CACHE_MS;
  bool shouldTryDhtNow = (millis() - lastDhtAttemptMs >= retryWindow);
  if (shouldTryDhtNow) {
    lastDhtAttemptMs = millis();
    for (int i = 0; i < 2; i++) {
      t = dht.readTemperature();
      h = dht.readHumidity();
      if (!isnan(t) && !isnan(h)) {
        dhtOk = true;
        break;
      }
      delay(20);
      yield();
    }
  } else if (hasLastDht) {
    t = lastGoodTemp;
    h = lastGoodHum;
    dhtOk = true;
  }

  if (dhtOk) {
    lastGoodTemp = clampFloat(t, -20, 80);
    lastGoodHum = clampFloat(h, 1, 100);
    hasLastDht = true;
    dhtFailStreak = 0;
  } else {
    dhtFailStreak++;
    if (dhtFailStreak >= DHT_REINIT_THRESHOLD &&
        (millis() - lastDhtReinitMs) >= DHT_REINIT_COOLDOWN_MS) {
      lastDhtReinitMs = millis();
      Serial.printf("[DHT] fail streak=%u -> reinit DHT\n", dhtFailStreak);
      dht.begin();
      delay(20);
      yield();
    }

    if (!hasLastDht) {
      t = clampFloat(lastGoodTemp, -20, 80);
      h = clampFloat(lastGoodHum, 1, 100);
      hasLastDht = true;
      Serial.println("DHT not ready and no cached value -> use bootstrap fallback");
    } else {
      t = lastGoodTemp;
      h = lastGoodHum;
      Serial.println("DHT read failed -> use cached DHT values");
    }
  }

  int soilADC = analogRead(PIN_SOIL_ADC);
  int soilPct = soilPercentFromADC(soilADC);

  float lux = readLuxSafe();
  bool luxOk = isfinite(lux);
  int lightPct = luxOk ? lightPercentFromLux(lux) : 0;

  DynamicJsonDocument doc(1024);
  doc["farm_id"] = FARM_ID;
  doc["device_key"] = String(DEVICE_KEY);
  doc["temperature"]  = (double)clampFloat(t, -20, 80);
  doc["humidity_air"] = (double)clampFloat(h, 1, 100);
  doc["soil_raw_adc"] = soilADC;
  doc["soil_moisture"] = soilPct;

  if (luxOk) {
    doc["light_lux"] = (double)lux;
    doc["light_percent"] = lightPct;
  } else {
    doc["light_lux"] = nullptr;
    doc["light_percent"] = nullptr;
  }

  doc["pump_running"] = false;
  doc["mist_running"] = false;
  doc["mode"] = "AUTO";

  String payload;
  payload.reserve(640);
  serializeJson(doc, payload);
  if (doc.overflowed() || payload.indexOf("\"device_key\"") < 0) {
    Serial.println("[SENSOR] invalid JSON payload (missing device_key/overflow), skip send");
    return false;
  }
  if (payload.indexOf("\"soil_moisture\"") < 0 || payload.indexOf("\"soil_raw_adc\"") < 0) {
    Serial.println("[SENSOR] payload missing soil keys -> skip send");
    return false;
  }

  int sensorCode = httpPostJson(EP_SENSOR, payload);
  if (sensorCode < 200 || sensorCode >= 300) {
    Serial.println("[SENSOR] POST failed, payload sent was:");
    Serial.println(payload);
  }

  char luxBuf[16];
  if (luxOk) snprintf(luxBuf, sizeof(luxBuf), "%.0f", lux);
  else snprintf(luxBuf, sizeof(luxBuf), "N/A");

  Serial.printf("TEMP=%.1f RH=%.1f | SOIL=%d%% adc=%d | LUX=%s | BH=%s\n",
    clampFloat(t, -20, 80), clampFloat(h, 1, 100),
    soilPct, soilADC, luxBuf, bhOk ? "OK" : "FAIL"
  );

  return true;
}

const char* resetReasonToText(esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_POWERON: return "POWERON";
    case ESP_RST_EXT: return "EXTERNAL_PIN";
    case ESP_RST_SW: return "SOFTWARE";
    case ESP_RST_PANIC: return "PANIC_EXCEPTION";
    case ESP_RST_INT_WDT: return "INT_WDT";
    case ESP_RST_TASK_WDT: return "TASK_WDT";
    case ESP_RST_WDT: return "OTHER_WDT";
    case ESP_RST_DEEPSLEEP: return "DEEPSLEEP";
    case ESP_RST_BROWNOUT: return "BROWNOUT";
    case ESP_RST_SDIO: return "SDIO";
    default: return "UNKNOWN";
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);

  esp_reset_reason_t rr = esp_reset_reason();
  Serial.printf("[BOOT] reset reason: %d (%s)\n", (int)rr, resetReasonToText(rr));

  analogReadResolution(12);
  dht.begin();

  Wire.begin(21, 22);
  delay(100);
  i2cScanOnce();
  initBH1750();

  ensureWiFi();
  buildEndpoints();

  lastStatusMs = millis();
  lastSensorMs = millis() - (SENSOR_INTERVAL_MS / 2);
}

void loop() {
  ensureWiFi();
  handleNetworkAutoRecover();

  unsigned long now = millis();

  if (now - lastStatusMs >= STATUS_INTERVAL_MS) {
    lastStatusMs = now;
    sendStatus();
  }

  if (now - lastSensorMs >= SENSOR_INTERVAL_MS) {
    bool sent = sendSensor();
    if (sent) lastSensorMs = now;
  }

  delay(10);
}
