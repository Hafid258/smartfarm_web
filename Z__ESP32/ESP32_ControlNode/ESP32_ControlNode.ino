#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

const char* WIFI_SSID = "SUDOFARM4G";
const char* WIFI_PASS = "1234567890";

const char* API_BASE = "https://smartfarm-backend-i46a.vercel.app/api";
const char* FARM_ID = "69b391c32948ba87e0fa57cb";
const char* DEVICE_KEY = "a87f4e0bcaf43d7f879946b5";

const int RELAY_PUMP_PIN = 26;
const int RELAY_MIST_PIN = 27;
const bool RELAY_ACTIVE_LOW = false;

const unsigned long STATUS_INTERVAL_MS = 10000UL;
const unsigned long POLL_INTERVAL_MS = 2000UL;
const unsigned long ACK_RETRY_MS = 3000UL;

String EP_STATUS;
String EP_POLL;
String EP_ACK;

bool pumpRunning = false;
bool mistRunning = false;
bool pumpPaused = false;
bool mistPaused = false;

unsigned long pumpStopAtMs = 0;
unsigned long mistStopAtMs = 0;
unsigned long pumpStartedAtMs = 0;
unsigned long mistStartedAtMs = 0;
unsigned long pausedPumpRemainingSec = 0;
unsigned long pausedMistRemainingSec = 0;

String pendingPumpOnCommandId = "";
String pendingMistOnCommandId = "";
String lastCommandId = "";

unsigned long lastStatusMs = 0;
unsigned long lastPollMs = 0;
unsigned long lastAckTryMs = 0;

unsigned long nextNetAllowedMs = 0;
unsigned long netBackoffMs = 0;
const unsigned long NET_BACKOFF_BASE_MS = 3000UL;
const unsigned long NET_BACKOFF_MAX_MS = 30000UL;

static inline void relayWrite(int pin, bool on) {
  if (RELAY_ACTIVE_LOW) digitalWrite(pin, on ? LOW : HIGH);
  else digitalWrite(pin, on ? HIGH : LOW);
}

int clampInt(int v, int lo, int hi) {
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

bool extractJsonString(const String& body, const char* key, String& out) {
  String pattern = String("\"") + key + "\"";
  int keyPos = body.indexOf(pattern);
  if (keyPos < 0) return false;
  int colonPos = body.indexOf(':', keyPos + pattern.length());
  if (colonPos < 0) return false;
  int firstQuote = body.indexOf('"', colonPos + 1);
  if (firstQuote < 0) return false;
  int i = firstQuote + 1;
  String result = "";
  while (i < body.length()) {
    char c = body[i];
    if (c == '\\' && i + 1 < body.length()) {
      result += body[i + 1];
      i += 2;
      continue;
    }
    if (c == '"') {
      out = result;
      return true;
    }
    result += c;
    i++;
  }
  return false;
}

bool extractJsonLong(const String& body, const char* key, long& out) {
  String pattern = String("\"") + key + "\"";
  int keyPos = body.indexOf(pattern);
  if (keyPos < 0) return false;
  int colonPos = body.indexOf(':', keyPos + pattern.length());
  if (colonPos < 0) return false;
  int start = colonPos + 1;
  while (start < body.length() && (body[start] == ' ' || body[start] == '\n' || body[start] == '\r' || body[start] == '\t')) start++;
  int end = start;
  while (end < body.length() && ((body[end] >= '0' && body[end] <= '9') || body[end] == '-')) end++;
  if (end <= start) return false;
  out = body.substring(start, end).toInt();
  return true;
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
  EP_POLL = String(API_BASE) + "/device/commands/poll?farm_id=" + FARM_ID + "&device_key=" + DEVICE_KEY;
  EP_ACK = String(API_BASE) + "/device/commands/ack?farm_id=" + FARM_ID + "&device_key=" + DEVICE_KEY;
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

void stopPump() {
  relayWrite(RELAY_PUMP_PIN, false);
  pumpRunning = false;
  pumpStopAtMs = 0;
  Serial.println("Pump OFF");
}

void stopMist() {
  relayWrite(RELAY_MIST_PIN, false);
  mistRunning = false;
  mistStopAtMs = 0;
  Serial.println("Mist OFF");
}

void startPumpForSeconds(int sec) {
  sec = clampInt(sec, 1, 3600);
  relayWrite(RELAY_PUMP_PIN, true);
  pumpRunning = true;
  pumpStartedAtMs = millis();
  pumpStopAtMs = millis() + (unsigned long)sec * 1000UL;
  Serial.printf("Pump ON for %d sec\n", sec);
}

void startMistForSeconds(int sec) {
  sec = clampInt(sec, 1, 3600);
  relayWrite(RELAY_MIST_PIN, true);
  mistRunning = true;
  mistStartedAtMs = millis();
  mistStopAtMs = millis() + (unsigned long)sec * 1000UL;
  Serial.printf("Mist ON for %d sec\n", sec);
}

void handleAutoStop() {
  unsigned long now = millis();
  if (pumpRunning && pumpStopAtMs > 0 && now >= pumpStopAtMs) stopPump();
  if (mistRunning && mistStopAtMs > 0 && now >= mistStopAtMs) stopMist();
}

bool sendAck(const String& commandId, const char* status, int actualDurationSec) {
  if (!netAllowed() || commandId.length() == 0) return false;

  String payload = "{";
  payload += jsonStringField("farm_id", FARM_ID);
  payload += ",";
  payload += jsonStringField("device_key", DEVICE_KEY);
  payload += ",";
  payload += jsonStringField("command_id", commandId);
  payload += ",";
  payload += jsonStringField("status", status);
  payload += ",";
  payload += jsonIntField("actual_duration_sec", actualDurationSec);
  payload += "}";

  int code = httpPostJson(EP_ACK, payload);
  return code >= 200 && code < 300;
}

void ackFinishedOnCommands() {
  if (!netAllowed()) return;
  if (millis() - lastAckTryMs < ACK_RETRY_MS) return;
  lastAckTryMs = millis();

  if (!pumpRunning && pendingPumpOnCommandId.length() > 0) {
    int actualSec = max(1, (int)((millis() - pumpStartedAtMs) / 1000UL));
    if (sendAck(pendingPumpOnCommandId, "done", actualSec)) {
      pendingPumpOnCommandId = "";
      pumpStartedAtMs = 0;
    }
  }

  if (!mistRunning && pendingMistOnCommandId.length() > 0) {
    int actualSec = max(1, (int)((millis() - mistStartedAtMs) / 1000UL));
    if (sendAck(pendingMistOnCommandId, "done", actualSec)) {
      pendingMistOnCommandId = "";
      mistStartedAtMs = 0;
    }
  }
}

void sendStatus() {
  if (WiFi.status() != WL_CONNECTED || !netAllowed()) return;

  String payload = "{";
  payload += jsonStringField("farm_id", FARM_ID);
  payload += ",";
  payload += jsonStringField("device_key", DEVICE_KEY);
  payload += ",";
  payload += jsonStringField("device_role", "control");
  payload += ",";
  payload += jsonStringField("ip", WiFi.localIP().toString());
  payload += ",";
  payload += jsonIntField("wifi_rssi", WiFi.RSSI());
  payload += ",";
  payload += jsonStringField("pump_state", pumpRunning ? "ON" : "OFF");
  payload += ",";
  payload += jsonStringField("mist_state", mistRunning ? "ON" : "OFF");
  payload += ",";
  payload += jsonStringField("fw_version", "control-v2.0.0");
  payload += ",";
  payload += jsonIntField("uptime_sec", millis() / 1000UL);
  payload += "}";

  httpPostJson(EP_STATUS, payload);
}

void handleDeviceCommand(const String& commandId, const String& deviceId, const String& command, int durationSec) {
  if (deviceId == "pump") {
    if (command == "ON") {
      pumpPaused = false;
      pausedPumpRemainingSec = 0;
      if (!pumpRunning) {
        pendingPumpOnCommandId = commandId;
        startPumpForSeconds(durationSec > 0 ? durationSec : 30);
      } else {
        sendAck(commandId, "done", 0);
      }
      return;
    }
    if (command == "OFF") {
      stopPump();
      pumpPaused = false;
      pausedPumpRemainingSec = 0;
      if (pendingPumpOnCommandId.length() > 0) {
        sendAck(pendingPumpOnCommandId, "failed", 0);
        pendingPumpOnCommandId = "";
      }
      sendAck(commandId, "done", 0);
      return;
    }
    if (command == "PAUSE") {
      if (pumpRunning) {
        pausedPumpRemainingSec = (pumpStopAtMs > millis()) ? (pumpStopAtMs - millis() + 999) / 1000UL : 0;
        stopPump();
        pumpPaused = true;
      }
      sendAck(commandId, "done", 0);
      return;
    }
    if (command == "RESUME") {
      if (pumpPaused && pausedPumpRemainingSec > 0) {
        startPumpForSeconds((int)pausedPumpRemainingSec);
        pumpPaused = false;
        pausedPumpRemainingSec = 0;
      }
      sendAck(commandId, "done", 0);
      return;
    }
  }

  if (deviceId == "mist") {
    if (command == "ON") {
      mistPaused = false;
      pausedMistRemainingSec = 0;
      if (!mistRunning) {
        pendingMistOnCommandId = commandId;
        startMistForSeconds(durationSec > 0 ? durationSec : 30);
      } else {
        sendAck(commandId, "done", 0);
      }
      return;
    }
    if (command == "OFF") {
      stopMist();
      mistPaused = false;
      pausedMistRemainingSec = 0;
      if (pendingMistOnCommandId.length() > 0) {
        sendAck(pendingMistOnCommandId, "failed", 0);
        pendingMistOnCommandId = "";
      }
      sendAck(commandId, "done", 0);
      return;
    }
    if (command == "PAUSE") {
      if (mistRunning) {
        pausedMistRemainingSec = (mistStopAtMs > millis()) ? (mistStopAtMs - millis() + 999) / 1000UL : 0;
        stopMist();
        mistPaused = true;
      }
      sendAck(commandId, "done", 0);
      return;
    }
    if (command == "RESUME") {
      if (mistPaused && pausedMistRemainingSec > 0) {
        startMistForSeconds((int)pausedMistRemainingSec);
        mistPaused = false;
        pausedMistRemainingSec = 0;
      }
      sendAck(commandId, "done", 0);
      return;
    }
  }

  sendAck(commandId, "failed", 0);
}

void pollCommands() {
  if (WiFi.status() != WL_CONNECTED || !netAllowed()) return;

  String body;
  int code = httpGet(EP_POLL, body);
  if (code != 200) return;
  if (body == "null" || body.length() < 5) return;

  String commandId = "";
  String command = "";
  String deviceId = "";
  long durationSec = 0;

  if (!extractJsonString(body, "_id", commandId)) return;
  if (!extractJsonString(body, "command", command)) return;
  extractJsonString(body, "device_id", deviceId);
  extractJsonLong(body, "duration_sec", durationSec);

  command.toUpperCase();
  deviceId.toLowerCase();
  if (deviceId.length() == 0) deviceId = "pump";

  if (commandId.length() == 0 || command.length() == 0) return;
  if (commandId == lastCommandId) return;
  lastCommandId = commandId;

  Serial.printf("Got command: %s device=%s id=%s duration=%ld\n",
                command.c_str(), deviceId.c_str(), commandId.c_str(), durationSec);

  handleDeviceCommand(commandId, deviceId, command, (int)durationSec);
}

void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(RELAY_PUMP_PIN, OUTPUT);
  pinMode(RELAY_MIST_PIN, OUTPUT);
  relayWrite(RELAY_PUMP_PIN, false);
  relayWrite(RELAY_MIST_PIN, false);

  buildEndpoints();
  ensureWiFi();
}

void loop() {
  ensureWiFi();
  handleAutoStop();
  ackFinishedOnCommands();

  unsigned long now = millis();
  if (now - lastStatusMs >= STATUS_INTERVAL_MS) {
    lastStatusMs = now;
    sendStatus();
  }
  if (now - lastPollMs >= POLL_INTERVAL_MS) {
    lastPollMs = now;
    pollCommands();
  }

  delay(20);
}
