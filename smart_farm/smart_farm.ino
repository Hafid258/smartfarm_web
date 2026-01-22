#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "DHT.h"

// =====================
// 1) WiFi Config
// =====================
const char* WIFI_SSID = "Gggg";
const char* WIFI_PASS = "12345678";

// =====================
// 2) API Config
// =====================
// เครื่อง backend ของคุณ (จาก IPv4 ที่ให้มา)r
const char* API_BASE = "http://10.204.125.208:3000";

// ✅ เปลี่ยน endpoint ให้ตรงกับ backend จริงของคุณ
// ตัวอย่าง: "/api/sensor/ingest" หรือ "/api/sensor-data" หรือ "/api/sensor"
const char* API_ENDPOINT = "/api/sensor/ingest";

// ถ้ามี farm_id ใช้ query string ได้
const char* FARM_ID = "694f46c2707b1b7026839ae2";

// ถ้าคุณจะใช้ device_key (แนะนำให้มี) ใส่ไว้
const char* DEVICE_KEY = "123456789";

// =====================
// 3) Sensor Pin Config
// =====================
// DHT22
#define DHTPIN 4
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

// Soil moisture sensor (analog)
#define SOIL_PIN 34  // ADC pin (ESP32: 32-39 เป็น input-only)

// (ทางเลือก) รีเลย์ปั๊มน้ำ
#define PUMP_RELAY_PIN 26  // ถ้าใช้คุมปั๊ม

// =====================
// 4) Sampling
// =====================
unsigned long lastSend = 0;
const unsigned long SEND_INTERVAL_MS = 10000; // ส่งทุก 10 วินาที (ปรับได้)

// =====================
// Helpers
// =====================

// แปลงค่า ADC -> % (ต้องคาลิเบรตตามเซนเซอร์จริง)
// dryADC = ค่าเมื่อดินแห้งสุด, wetADC = ค่าเมื่อจุ่มน้ำ/ชื้นสุด
int dryADC = 3500; // ปรับตามจริง
int wetADC = 1500; // ปรับตามจริง

int adcToPercent(int adc) {
  // clamp
  if (adc > dryADC) adc = dryADC;
  if (adc < wetADC) adc = wetADC;

  // dryADC -> 0%, wetADC -> 100%
  float pct = (float)(dryADC - adc) * 100.0 / (float)(dryADC - wetADC);
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return (int)(pct + 0.5);
}

// ส่งข้อมูลด้วย HTTP POST (JSON)
bool postSensorData(float tempC, float rh, int soilPct, int soilRaw) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;

  // ทำ URL: base + endpoint + farm_id query
  String url = String(API_BASE) + String(API_ENDPOINT) + "?farm_id=" + FARM_ID;

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // สร้าง JSON
  StaticJsonDocument<256> doc;
  doc["device_key"] = DEVICE_KEY;     // เผื่อ backend ใช้ตรวจสิทธิ์/ระบุอุปกรณ์
  doc["temperature"] = tempC;         // °C
  doc["humidity_air"] = rh;           // %
  doc["soil_moisture"] = soilPct;     // %
  doc["soil_raw_adc"] = soilRaw;      // raw adc
  // doc["timestamp"] = ... (ปกติ backend จะใส่เวลาเอง)

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  String resp = http.getString();
  http.end();

  Serial.print("POST ");
  Serial.print(url);
  Serial.print(" -> code=");
  Serial.println(code);

  if (code >= 200 && code < 300) {
    Serial.println(resp);
    return true;
  } else {
    Serial.println(resp);
    return false;
  }
}

void connectWiFi() {
  // ✅ แก้ error: "sta is connecting, cannot set config"
  WiFi.disconnect(true, true);
  delay(500);

  WiFi.mode(WIFI_STA);
  delay(100);

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting WiFi");

  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("✅ WiFi Connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("❌ WiFi Failed!");
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(PUMP_RELAY_PIN, OUTPUT);
  digitalWrite(PUMP_RELAY_PIN, LOW); // ปรับ HIGH/LOW ตามรีเลย์ของคุณ

  dht.begin();

  connectWiFi();
}

void loop() {
  // ถ้า WiFi หลุด ให้พยายามต่อใหม่
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  unsigned long now = millis();
  if (now - lastSend >= SEND_INTERVAL_MS) {
    lastSend = now;

    float rh = dht.readHumidity();
    float tempC = dht.readTemperature();

    int soilRaw = analogRead(SOIL_PIN);
    int soilPct = adcToPercent(soilRaw);

    // กันค่าอ่านผิดจาก DHT
    if (isnan(rh) || isnan(tempC)) {
      Serial.println("❌ DHT read failed");
      return;
    }

    Serial.print("Temp=");
    Serial.print(tempC);
    Serial.print("C  RH=");
    Serial.print(rh);
    Serial.print("%  Soil=");
    Serial.print(soilPct);
    Serial.print("%  ADC=");
    Serial.println(soilRaw);

    bool ok = postSensorData(tempC, rh, soilPct, soilRaw);
    Serial.println(ok ? "✅ Sent OK" : "❌ Send Failed");
  }

  delay(50);
}
