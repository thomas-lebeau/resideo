import { describe, test } from "node:test";
import assert from "node:assert/strict";

process.env.THERMOBEACON_DEVICES = JSON.stringify({
  "aa:bb:cc:dd:ee:ff": "Living Room",
});

const { Thermobeacon } = await import("./thermobeacon.mts");

/**
 * Builds a 20-byte ThermoBeacon WS08 advertisement (manufacturer data).
 * The MAC address is stored little-endian, readings are signed int16 LE.
 */
function advertisement({
  mac = "aa:bb:cc:dd:ee:ff",
  battery = 3400,
  temperature = 0,
  humidity = 0,
  length = 20,
} = {}) {
  const buffer = Buffer.alloc(length);
  buffer.set(
    mac
      .split(":")
      .map((byte) => parseInt(byte, 16))
      .reverse(),
    4
  );
  buffer.writeInt16LE(battery, 10);
  buffer.writeInt16LE(temperature * 16, 12);
  buffer.writeInt16LE(humidity * 16, 14);
  return buffer;
}

describe("Thermobeacon", () => {
  const plugin = new Thermobeacon();

  test("parseMacAddress reads the little-endian MAC address", () => {
    assert.equal(plugin.parseMacAddress(advertisement()), "aa:bb:cc:dd:ee:ff");
  });

  test("parseSensorReadings decodes temperature, humidity and battery", () => {
    assert.deepEqual(
      plugin.parseSensorReadings(
        advertisement({ temperature: 21.5, humidity: 45.25, battery: 1700 })
      ),
      { temperature: 21.5, humidity: 45.25, battery_level: 50 }
    );
  });

  test("parseSensorReadings decodes negative temperatures", () => {
    assert.equal(
      plugin.parseSensorReadings(advertisement({ temperature: -5.5 }))
        ?.temperature,
      -5.5
    );
  });

  test("parseSensorReadings skips device info packets", () => {
    assert.equal(
      plugin.parseSensorReadings(advertisement({ length: 22 })),
      undefined
    );
  });

  test("parseSensorReadings skips unknown devices", () => {
    assert.equal(
      plugin.parseSensorReadings(advertisement({ mac: "11:22:33:44:55:66" })),
      undefined
    );
  });
});
