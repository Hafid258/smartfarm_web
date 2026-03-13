/****************************************************
 * SmartFarm ESP32 Control Node (2 Relay)
 * Split mode: this node only handles command poll/ack + status
 ****************************************************/

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <esp_system.h>

// ------------------ WiFi ------------------
const char* WIFI_SSID = "SUDOFARM4G";
const char* WIFI_PASS = "1234567890";

// ------------------ API ------------------
String apiBase = "https://smartfarm-backend-i46a.vercel.app/api";
const char* FARM_ID    = "697b7012a25c6b8336c8f51e";
const char* DEVICE_KEY = "YOUR_CONTROL_DEVICE_KEY";

String EP_STATUS;
String EP_POLL;
String EP_ACK;

// ------------------ Pins ------------------
const int RELAY1_PIN = 26; // pump
const int RELAY2_PIN = 27; // mist
const bool RELAY_ACTIVE_LOW = false;

// ------------------ Timing ------------------
unsigned long lastStatusMs = 0;
unsigned long lastPollMs   = 0;
const unsigned long STATUS_INTERVAL_MS = 60UL * 1000UL;
const unsigned long POLL_INTERVAL_MS   = 20UL * 1000UL;

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

// ------------------ Runtime ------------------
bool pumpRunning = false;
unsigned long pumpStopAtMs = 0;
unsigned long pumpStartedAtMs = 0;
bool pumpPaused = false;
unsigned long pausedRemainingSec = 0;
String pendingPumpOnCommandId = "";

bool mistRunning = false;
unsigned long mistStopAtMs = 0;
unsigned long mistStartedAtMs = 0;
bool mistPaused = false;
unsigned long pausedMistRemainingSec = 0;
String pendingMistOnCommandId = "";

String lastCommandId = "";
unsigned long lastAckTryMs = 0;
const unsigned long ACK_RETRY_MS = 5000UL;

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
  EP_STATUS = apiBase + "/device-status/status?farm_id=" + String(FARM_ID) + "&device_key=" + String(DEVICE_KEY);
  EP_POLL   = apiBase + "/device/commands/poll?farm_id=" + String(FARM_ID) + "&device_key=" + String(DEVICE_KEY);
  EP_ACK    = apiBase + "/device/commands/ack?farm_id=" + String(FARM_ID) + "&device_key=" + String(DEVICE_KEY);
}

static inline void relayWrite(int pin, bool on) {
  if (RELAY_ACTIVE_LOW) digitalWrite(pin, on ? LOW : HIGH);
  else digitalWrite(pin, on ? HIGH : LOW);
}

static inline int clampInt(int v, int lo, int hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
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

int httpGet(const String& url, String& outBody) {
  outBody = "";
  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(12000);

  HTTPClient http;
  http.setTimeout(12000);

  if (!http.begin(client, url)) {
    Serial.printf("[GET] begin() failed: %s\n", url.c_str());
    noteNetFailure();
    return -1;
  }

  http.addHeader("ngrok-skip-browser-warning", "1");

  int code = http.GET();
  outBody = http.getString();
  Serial.printf("[GET] %s -> %d\n", url.c_str(), code);

  if (code < 0) {
    Serial.printf("HTTPClient error: %s\n", http.errorToString(code).c_str());
    noteNetFailure();
  } else if (code < 200 || code >= 300) {
    Serial.printf("Body: %s\n", outBody.c_str());
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

  if (pumpRunning) {
    relayWrite(RELAY1_PIN, false);
    pumpRunning = false;
    pumpStopAtMs = 0;
  }
  if (mistRunning) {
    relayWrite(RELAY2_PIN, false);
    mistRunning = false;
    mistStopAtMs = 0;
  }

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

void startMistForSeconds(int sec) {
  sec = clampInt(sec, 1, 3600);
  relayWrite(RELAY2_PIN, true);
  mistRunning = true;
  mistStartedAtMs = millis();
  mistStopAtMs = millis() + (unsigned long)sec * 1000UL;
  Serial.printf("Mist ON for %d sec\n", sec);
}

void stopMist() {
  relayWrite(RELAY2_PIN, false);
  mistRunning = false;
  mistStopAtMs = 0;
  Serial.println("Mist OFF");
}

void handleMistAutoStop() {
  if (mistRunning && mistStopAtMs > 0 && millis() >= mistStopAtMs) stopMist();
}

void sendStatus() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (!netAllowed()) return;

  DynamicJsonDocument doc(512);
  doc["farm_id"] = FARM_ID;
  doc["device_key"] = String(DEVICE_KEY);
  doc["device_role"] = "control";
  doc["ip"] = WiFi.localIP().toString();
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["pump_state"] = pumpRunning ? "ON" : "OFF";
  doc["mist_state"] = mistRunning ? "ON" : "OFF";
  doc["fw_version"] = "control-v1.1.1";
  doc["uptime_sec"] = (int)(millis() / 1000UL);

  String payload;
  serializeJson(doc, payload);
  if (doc.overflowed() || payload.indexOf("\"device_key\"") < 0) {
    Serial.println("[STATUS] invalid JSON payload (missing device_key/overflow), skip send");
    return;
  }

  httpPostJson(EP_STATUS, payload);
}

bool sendAck(const char* commandId, const char* status, int actualDurationSec) {
  if (!commandId || !commandId[0]) return false;
  if (!netAllowed()) return false;

  DynamicJsonDocument ack(256);
  ack["farm_id"] = FARM_ID;
  ack["device_key"] = String(DEVICE_KEY);
  ack["command_id"] = commandId;
  ack["status"] = status;
  ack["actual_duration_sec"] = actualDurationSec;

  String payload;
  serializeJson(ack, payload);
  if (ack.overflowed() || payload.indexOf("\"device_key\"") < 0) {
    Serial.println("[ACK] invalid JSON payload (missing device_key/overflow), skip send");
    return false;
  }

  int code = httpPostJson(EP_ACK, payload);
  return code >= 200 && code < 300;
}

void pollCommands() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (!netAllowed()) return;

  String body;
  int code = httpGet(EP_POLL, body);
  if (code < 200 || code >= 300) return;
  if (body.length() < 5) return;

  StaticJsonDocument<2048> doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    Serial.printf("JSON error: %s\n", err.c_str());
    return;
  }

  const char* id  = doc["_id"] | "";
  const char* cmd = doc["command"] | "";
  const char* deviceIdRaw = doc["device_id"] | "pump";
  int duration = doc["duration_sec"] | 0;

  if (strlen(id) == 0 || strlen(cmd) == 0) return;
  if (lastCommandId == String(id)) return;
  lastCommandId = String(id);

  String cmdStr = String(cmd);
  String deviceId = String(deviceIdRaw);
  if (deviceId.length() == 0) deviceId = "pump";
  Serial.printf("Got command: %s device=%s id=%s duration=%d\n", cmdStr.c_str(), deviceId.c_str(), id, duration);

  if (deviceId == "pump") {
    if (cmdStr == "ON") {
      pumpPaused = false;
      pausedRemainingSec = 0;
      if (!pumpRunning) {
        pendingPumpOnCommandId = id;
        startPumpForSeconds(duration > 0 ? duration : 30);
      } else {
        sendAck(id, "done", 0);
      }
    } else if (cmdStr == "OFF") {
      stopPump();
      pumpPaused = false;
      pausedRemainingSec = 0;
      if (pendingPumpOnCommandId.length() > 0) {
        sendAck(pendingPumpOnCommandId.c_str(), "failed", 0);
        pendingPumpOnCommandId = "";
        pumpStartedAtMs = 0;
      }
      sendAck(id, "done", 0);
    } else if (cmdStr == "PAUSE") {
      if (pumpRunning) {
        unsigned long remainMs = pumpStopAtMs > millis() ? (pumpStopAtMs - millis()) : 0;
        pausedRemainingSec = (remainMs + 999) / 1000UL;
        stopPump();
        pumpPaused = true;
      }
      sendAck(id, "done", 0);
    } else if (cmdStr == "RESUME") {
      if (pumpPaused && pausedRemainingSec > 0) {
        startPumpForSeconds((int)pausedRemainingSec);
        pumpPaused = false;
        pausedRemainingSec = 0;
      }
      sendAck(id, "done", 0);
    } else {
      sendAck(id, "failed", 0);
    }
    return;
  }

  if (deviceId == "mist") {
    if (cmdStr == "ON") {
      mistPaused = false;
      pausedMistRemainingSec = 0;
      if (!mistRunning) {
        pendingMistOnCommandId = id;
        startMistForSeconds(duration > 0 ? duration : 30);
      } else {
        sendAck(id, "done", 0);
      }
    } else if (cmdStr == "OFF") {
      stopMist();
      if (pendingMistOnCommandId.length() > 0) {
        sendAck(pendingMistOnCommandId.c_str(), "failed", 0);
        pendingMistOnCommandId = "";
        mistStartedAtMs = 0;
      }
      mistPaused = false;
      pausedMistRemainingSec = 0;
      sendAck(id, "done", 0);
    } else if (cmdStr == "PAUSE") {
      if (mistRunning) {
        unsigned long remainMs = mistStopAtMs > millis() ? (mistStopAtMs - millis()) : 0;
        pausedMistRemainingSec = (remainMs + 999) / 1000UL;
        stopMist();
        mistPaused = true;
      }
      sendAck(id, "done", 0);
    } else if (cmdStr == "RESUME") {
      if (mistPaused && pausedMistRemainingSec > 0) {
        startMistForSeconds((int)pausedMistRemainingSec);
        mistPaused = false;
        pausedMistRemainingSec = 0;
      }
      sendAck(id, "done", 0);
    } else {
      sendAck(id, "failed", 0);
    }
    return;
  }

  sendAck(id, "failed", 0);
}

void ackIfOnFinished() {
  if (!netAllowed()) return;

  unsigned long now = millis();
  if (now - lastAckTryMs < ACK_RETRY_MS) return;
  lastAckTryMs = now;

  if (!pumpRunning && pendingPumpOnCommandId.length() > 0) {
    unsigned long durMs = 0;
    if (pumpStartedAtMs > 0) durMs = millis() - pumpStartedAtMs;
    int actualSec = (int)(durMs / 1000UL);
    if (actualSec <= 0) actualSec = 1;

    bool ok = sendAck(pendingPumpOnCommandId.c_str(), "done", actualSec);
    if (ok) {
      pendingPumpOnCommandId = "";
      pumpStartedAtMs = 0;
    }
  }

  if (!mistRunning && pendingMistOnCommandId.length() > 0) {
    unsigned long durMs = 0;
    if (mistStartedAtMs > 0) durMs = millis() - mistStartedAtMs;
    int actualSec = (int)(durMs / 1000UL);
    if (actualSec <= 0) actualSec = 1;

    bool ok = sendAck(pendingMistOnCommandId.c_str(), "done", actualSec);
    if (ok) {
      pendingMistOnCommandId = "";
      mistStartedAtMs = 0;
    }
  }
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

  pinMode(RELAY1_PIN, OUTPUT);
  pinMode(RELAY2_PIN, OUTPUT);
  relayWrite(RELAY1_PIN, false);
  relayWrite(RELAY2_PIN, false);

  ensureWiFi();
  buildEndpoints();

  lastStatusMs = millis();
  lastPollMs = millis() - (POLL_INTERVAL_MS / 2);
}

void loop() {
  ensureWiFi();
  handleNetworkAutoRecover();

  handlePumpAutoStop();
  handleMistAutoStop();
  ackIfOnFinished();

  unsigned long now = millis();

  if (now - lastStatusMs >= STATUS_INTERVAL_MS) {
    lastStatusMs = now;
    sendStatus();
  }

  if (now - lastPollMs >= POLL_INTERVAL_MS) {
    lastPollMs = now;
    pollCommands();
  }

  delay(10);
}
