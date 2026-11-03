import { EventEmitter } from "node:events";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

process.env.THERMOBEACON_DEVICES = JSON.stringify({
  "aa:bb:cc:dd:ee:ff": "Living Room",
  "11:22:33:44:55:01": "Bedroom",
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

/**
 * Minimal stand-in for the noble module: an event emitter with scan controls.
 */
class FakeNoble extends EventEmitter {
  _state = "poweredOn";
  scanning = false;

  async startScanningAsync() {
    if (this._state !== "poweredOn") {
      throw new Error("Could not start scanning, state is " + this._state);
    }
    this.scanning = true;
  }

  async stopScanningAsync() {
    this.scanning = false;
  }

  discover(mac: string, temperature: number) {
    this.emit("discover", {
      address: mac,
      rssi: -60,
      advertisement: {
        serviceUuids: ["fff0"],
        manufacturerData: advertisement({ mac, temperature }),
      },
    });
  }
}

function createPlugin(noble: FakeNoble) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Thermobeacon(async () => noble as any);
}

/** Lets pending promise callbacks (start, stop) run. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("Thermobeacon.run", () => {
  test("waits for every sensor instead of resolving on duplicate packets", async () => {
    const noble = new FakeNoble();
    const plugin = createPlugin(noble);
    let result: unknown;
    const run = plugin.run().then((data) => (result = data));
    await flush();

    noble.discover("aa:bb:cc:dd:ee:ff", 20);
    noble.discover("aa:bb:cc:dd:ee:ff", 21);
    await flush();
    assert.equal(result, undefined, "resolved with a single sensor");

    noble.discover("11:22:33:44:55:01", 18);
    await run;

    assert.deepEqual(
      (result as { name: string; temperature: number }[]).map(
        ({ name, temperature }) => ({ name, temperature })
      ),
      [
        { name: "Living Room", temperature: 21 },
        { name: "Bedroom", temperature: 18 },
      ]
    );
  });

  test("removes only its own listeners when stopping", async () => {
    const noble = new FakeNoble();
    const otherListener = () => {};
    noble.on("discover", otherListener);
    noble.on("stateChange", otherListener);
    const plugin = createPlugin(noble);
    const run = plugin.run();
    await flush();

    noble.discover("aa:bb:cc:dd:ee:ff", 20);
    noble.discover("11:22:33:44:55:01", 18);
    await run;

    assert.deepEqual(noble.listeners("discover"), [otherListener]);
    assert.deepEqual(noble.listeners("stateChange"), [otherListener]);
    assert.equal(noble.scanning, false);
  });

  test("resolves with partial data when a sensor is missing", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const noble = new FakeNoble();
    const plugin = createPlugin(noble);
    const run = plugin.run();
    await flush();

    noble.discover("aa:bb:cc:dd:ee:ff", 20);
    t.mock.timers.tick(5_000);

    const data = await run;
    assert.equal(data.length, 1);
    assert.equal(data[0]?.name, "Living Room");
  });

  test("starts scanning once the adapter powers on", async () => {
    const noble = new FakeNoble();
    noble._state = "poweredOff";
    const plugin = createPlugin(noble);
    const start = plugin.start();
    await flush();

    noble.emit("stateChange", "resetting");
    noble._state = "poweredOn";
    noble.emit("stateChange", "poweredOn");
    await start;

    assert.equal(noble.scanning, true);
    assert.equal(noble.listenerCount("stateChange"), 0);
  });

  test("rejects when the adapter never powers on", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const noble = new FakeNoble();
    noble._state = "poweredOff";
    const plugin = createPlugin(noble);
    const run = plugin.run();
    await flush();

    t.mock.timers.tick(5_000);

    await assert.rejects(run, /Bluetooth adapter did not power on.*poweredOff/);
    assert.equal(noble.listenerCount("stateChange"), 0);
    assert.equal(noble.scanning, false);
  });
});
