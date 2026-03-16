#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <DHT22.h>
#include <BH1750.h>

const char* WIFI_SSID = "SUDOFARM4G";
const char* WIFI_PASS = "1234567890";

const char* API_BASE = "https://smartfarm-backend-i46a.vercel.app/api";
const char* FARM_ID = "69b391c32948ba87e0fa57cb";
const char* DEVICE_KEY = "a87f4e0bcaf43d7f879946b5";

const int DHTPIN = 4;
const int PIN_SOIL_ADC = 34;
const int PIN_I2C_SDA = 21;
const int PIN_I2C_SCL = 22;

const int SOIL_ADC_DRY = 3200;
const int SOIL_ADC_WET = 1500;

const unsigned long STATUS_INTERVAL_MS = 10000UL;
const unsigned long SENSOR_INTERVAL_MS = 60000UL;
const unsigned long BH_RETRY_INTERVAL_MS = 15000UL;
const unsigned long DHT_RETRY_NO_CACHE_MS = 10000UL;
const unsigned long DHT_RETRY_WITH_CACHE_MS = 180000UL;
const unsigned int DHT_REINIT_THRESHOLD = 3;
const unsigned long DHT_REINIT_COOLDOWN_MS = 15000UL;

String EP_STATUS;
String EP_SENSOR;

DHT22 dht(DHTPIN);
BH1750 lightMeter;

bool bhOk = false;
bool hasLastDht = false;
float lastGoodTemp = 30.0f;
float lastGoodHum = 60.0f;

unsigned long lastBhInitMs = 0;
unsigned long lastDhtAttemptMs = 0;
unsigned long lastSensorMs = 0;
unsigned long lastStatusMs = 0;
unsigned long lastDhtReinitMs = 0;
unsigned int dhtFailStreak = 0;

unsigned long nextNetAllowedMs = 0;
unsigned long netBackoffMs = 0;
const unsigned long NET_BACKOFF_BASE_MS = 3000UL;
const unsigned long NET_BACKOFF_MAX_MS = 30000UL;

int clampInt(int v, int lo, int hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

float clampFloat(float v, float lo, float hi) {
  if (!isfinite(v)) return lo;
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

String jsonEscape(const String& s) {
  String out;
  out.reserve(s.length() + 8);
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '\\' || c == '"') out += '\\';
    out += c;
  }
  return out;
}

String jsonStringField(const char* key, const String& value) {
  return String("\"") + key + "\":\"" + jsonEscape(value) + "\"";
}

String jsonIntField(const char* key, long value) {
  return String("\"") + key + "\":" + String(value);
}

String jsonFloatField(const char* key, float value, int decimals = 2) {
  return String("\"") + key + "\":" + String(value, decimals);
}

bool netAllowed() {
  return millis() >= nextNetAllowedMs;
}

void noteNetSuccess() {
  netBackoffMs = 0;
  nextNetAllowedMs = 0;
}

void noteNetFailure() {
  if (netBackoffMs == 0) netBackoffMs = NET_BACKOFF_BASE_MS;
  else netBackoffMs = min(netBackoffMs * 2UL, NET_BACKOFF_MAX_MS);
  nextNetAllowedMs = millis() + netBackoffMs;
  Serial.printf("[NET] backoff %lu ms\n", netBackoffMs);
}

void buildEndpoints() {
  EP_STATUS = String(API_BASE) + "/device-status/status?farm_id=" + FARM_ID + "&device_key=" + DEVICE_KEY;
  EP_SENSOR = String(API_BASE) + "/device/sensor?farm_id=" + FARM_ID + "&device_key=" + DEVICE_KEY;
}

void ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.printf("Connecting WiFi: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000UL) {
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

int httpPostJson(const String& url, const String& payload) {
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

  int code = http.POST(payload);
  String body = http.getString();
  Serial.printf("[POST] %s -> %d\n", url.c_str(), code);
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

int soilPercentFromAdc(int adc) {
  long pct = map(adc, SOIL_ADC_DRY, SOIL_ADC_WET, 0, 100);
  return clampInt((int)pct, 0, 100);
}

int lightPercentFromLux(float lux) {
  long pct = (long)((lux / 20000.0f) * 100.0f);
  return clampInt((int)pct, 0, 100);
}

void initBH1750() {
  bhOk = lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);
  lastBhInitMs = millis();
  if (bhOk) Serial.println("[BH1750] OK");
  else Serial.println("[BH1750] begin() failed");
}

void ensureBH1750() {
  if (bhOk) return;
  if (millis() - lastBhInitMs < BH_RETRY_INTERVAL_MS) return;
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

void sendStatus(bool dhtOk, bool soilOk, bool lightOk, float lux) {
  if (WiFi.status() != WL_CONNECTED || !netAllowed()) return;

  String payload = "{";
  payload += jsonStringField("farm_id", FARM_ID);
  payload += ",";
  payload += jsonStringField("device_key", DEVICE_KEY);
  payload += ",";
  payload += jsonStringField("device_role", "sensor");
  payload += ",";
  payload += jsonStringField("ip", WiFi.localIP().toString());
  payload += ",";
  payload += jsonIntField("wifi_rssi", WiFi.RSSI());
  payload += ",";
  payload += jsonStringField("fw_version", "sensor-v2.0.0");
  payload += ",";
  payload += jsonIntField("uptime_sec", millis() / 1000UL);
  payload += ",";
  payload += String("\"dht_ok\":") + (dhtOk ? "true" : "false");
  payload += ",";
  payload += String("\"soil_ok\":") + (soilOk ? "true" : "false");
  payload += ",";
  payload += String("\"light_ok\":") + (lightOk ? "true" : "false");
  if (lightOk) {
    payload += ",";
    payload += jsonFloatField("light_lux", lux, 1);
  }
  payload += "}";

  httpPostJson(EP_STATUS, payload);
}

bool readDhtWithFallback(float& outTemp, float& outHum) {
  outTemp = NAN;
  outHum = NAN;

  unsigned long retryWindow = hasLastDht ? DHT_RETRY_WITH_CACHE_MS : DHT_RETRY_NO_CACHE_MS;
  bool shouldTryNow = millis() - lastDhtAttemptMs >= retryWindow;

  if (shouldTryNow) {
    lastDhtAttemptMs = millis();
    for (int i = 0; i < 2; i++) {
      float t = dht.getTemperature();
      float h = dht.getHumidity();
      if (dht.getLastError() == dht.OK && isfinite(t) && isfinite(h)) {
        outTemp = clampFloat(t, -20, 80);
        outHum = clampFloat(h, 1, 100);
        lastGoodTemp = outTemp;
        lastGoodHum = outHum;
        hasLastDht = true;
        dhtFailStreak = 0;
        return true;
      }
      delay(20);
      yield();
    }
  }

  dhtFailStreak++;
  if (dhtFailStreak >= DHT_REINIT_THRESHOLD &&
      millis() - lastDhtReinitMs >= DHT_REINIT_COOLDOWN_MS) {
    lastDhtReinitMs = millis();
    Serial.printf("[DHT] fail streak=%u -> retry sensor read path\n", dhtFailStreak);
  }

  if (hasLastDht) {
    outTemp = lastGoodTemp;
    outHum = lastGoodHum;
    Serial.println("DHT read failed -> use cached DHT values");
    return true;
  }

  Serial.println("DHT not ready and no cached value -> skip /device/sensor");
  return false;
}

void sendSensorData() {
  if (WiFi.status() != WL_CONNECTED || !netAllowed()) return;

  float t = NAN;
  float h = NAN;
  bool dhtOk = readDhtWithFallback(t, h);

  int soilAdc = analogRead(PIN_SOIL_ADC);
  bool soilOk = soilAdc >= 0 && soilAdc <= 4095;
  int soilPct = soilPercentFromAdc(soilAdc);

  float lux = readLuxSafe();
  bool lightOk = isfinite(lux);

  if (!dhtOk || !soilOk) {
    sendStatus(dhtOk, soilOk, lightOk, lux);
    return;
  }

  String payload = "{";
  payload += jsonStringField("farm_id", FARM_ID);
  payload += ",";
  payload += jsonStringField("device_key", DEVICE_KEY);
  payload += ",";
  payload += jsonFloatField("temperature", t, 1);
  payload += ",";
  payload += jsonFloatField("humidity_air", h, 1);
  payload += ",";
  payload += jsonIntField("soil_raw_adc", soilAdc);
  payload += ",";
  payload += jsonIntField("soil_moisture", soilPct);

  if (lightOk) {
    payload += ",";
    payload += jsonFloatField("light_lux", lux, 1);
    payload += ",";
    payload += jsonIntField("light_percent", lightPercentFromLux(lux));
  } else {
    payload += ",\"light_lux\":null,\"light_percent\":null";
  }

  payload += ",\"pump_running\":false,\"mist_running\":false,\"mode\":\"AUTO\"";
  payload += "}";

  int code = httpPostJson(EP_SENSOR, payload);
  if (code < 200 || code >= 300) {
    Serial.println("[SENSOR] POST failed, payload sent was:");
    Serial.println(payload);
  }

  Serial.printf("TEMP=%.1f RH=%.1f | SOIL=%d%% adc=%d | LUX=%s\n",
                t, h, soilPct, soilAdc, lightOk ? String(lux, 0).c_str() : "N/A");

  sendStatus(dhtOk, soilOk, lightOk, lux);
}

void setup() {
  Serial.begin(115200);
  delay(200);

  analogReadResolution(12);
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  delay(100);
  initBH1750();

  buildEndpoints();
  ensureWiFi();
}

void loop() {
  ensureWiFi();

  unsigned long now = millis();
  if (now - lastStatusMs >= STATUS_INTERVAL_MS) {
    lastStatusMs = now;
    sendStatus(dhtFailStreak == 0, true, bhOk, 0);
  }
  if (now - lastSensorMs >= SENSOR_INTERVAL_MS) {
    lastSensorMs = now;
    sendSensorData();
  }

  delay(20);
}
