#include <Wire.h>
#include <BH1750.h>

const int PIN_I2C_SDA = 21;
const int PIN_I2C_SCL = 22;

BH1750 lightMeter;

void scanI2C() {
  byte count = 0;
  Serial.println("[TEST] I2C scan start");
  for (byte address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    byte error = Wire.endTransmission();
    if (error == 0) {
      Serial.printf("[TEST] Found I2C device at 0x%02X\n", address);
      count++;
    }
  }
  if (count == 0) Serial.println("[TEST] No I2C device found");
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println();
  Serial.println("[TEST] BH1750 only");
  Serial.printf("[TEST] SDA=GPIO%d SCL=GPIO%d\n", PIN_I2C_SDA, PIN_I2C_SCL);
  Serial.println("[TEST] Expected wiring: VCC->3.3V, GND->GND, SDA->GPIO21, SCL->GPIO22");

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  delay(100);
  scanI2C();

  if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
    Serial.println("[TEST] BH1750 begin OK");
  } else {
    Serial.println("[TEST] BH1750 begin FAILED");
  }
}

void loop() {
  float lux = lightMeter.readLightLevel();
  if (isfinite(lux) && lux >= 0) {
    Serial.printf("LUX=%.1f\n", lux);
  } else {
    Serial.println("LUX read fail");
  }
  delay(2000);
}
