import { describe, test } from "node:test";
import assert from "node:assert/strict";

process.env.DHT22_SENSORS = JSON.stringify({ 4: "Bedroom" });

const { DHT22 } = await import("./dht22.mts");

function fakeSensor(read: () => Promise<unknown>) {
  return { read } as unknown as Parameters<DHT22["readSensor"]>[0];
}

describe("DHT22", () => {
  const plugin = new DHT22();
  plugin.logger.warn = () => {};

  test("readSensor returns the reading", async () => {
    const sensor = fakeSensor(async () => ({ temperature: 21.5, humidity: 40 }));

    assert.deepEqual(await plugin.readSensor(sensor, 4, "Bedroom"), {
      name: "Bedroom",
      type: "thermometer",
      temperature: 21.5,
      humidity: 40,
    });
  });

  test("readSensor keeps 0 °C and sub-zero readings", async () => {
    for (const temperature of [0, -3.2]) {
      const sensor = fakeSensor(async () => ({ temperature, humidity: 0 }));

      assert.equal(
        (await plugin.readSensor(sensor, 4, "Bedroom"))?.temperature,
        temperature
      );
    }
  });

  test("readSensor drops failed reads", async () => {
    const sensor = fakeSensor(async () => {
      throw new Error("failed to read sensor");
    });

    assert.equal(await plugin.readSensor(sensor, 4, "Bedroom"), undefined);
  });

  test("readSensor drops non-numeric readings", async () => {
    for (const data of [
      undefined,
      { temperature: NaN, humidity: 40 },
      { temperature: 21, humidity: undefined },
    ]) {
      const sensor = fakeSensor(async () => data);

      assert.equal(await plugin.readSensor(sensor, 4, "Bedroom"), undefined);
    }
  });
});
