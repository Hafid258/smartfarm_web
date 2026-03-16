#include <DHT22.h>

const int DHT_PIN = 18;
DHT22 dht(DHT_PIN);

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println();
  Serial.println("[TEST] DHT22 only");
  Serial.printf("[TEST] DATA pin = GPIO%d\n", DHT_PIN);
  Serial.println("[TEST] Expected wiring: VCC->3.3V, GND->GND, OUT->GPIO4, 10k between VCC and OUT");
}

void loop() {
  float t = dht.getTemperature();
  float h = dht.getHumidity();
  int err = dht.getLastError();

  Serial.printf("ERR=%d", err);
  if (err == dht.OK) {
    Serial.printf(" | TEMP=%.1f C | RH=%.1f %%\n", t, h);
  } else {
    Serial.println(" | READ FAIL");
  }

  delay(2000);
}
