import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";

process.env.HUE_HOST = "hue.local";
process.env.HUE_USERNAME = "hue-user";

const { PhilipsHue } = await import("./philips-hue.mts");

const NOW = Date.parse("2026-01-01T12:00:00.000Z");

const responses: Record<string, unknown[]> = {
  "/resource/light": [
    {
      id_v1: "/lights/1",
      metadata: { name: "Kitchen" },
      on: { on: true },
      dimming: { brightness: 80 },
      color_temperature: { mirek: 366 },
    },
    {
      id_v1: "/lights/2",
      metadata: { name: "Bedroom" },
      on: { on: false },
      dimming: { brightness: 0 },
      color_temperature: { mirek: 200 },
    },
    {
      id_v1: "/lights/3",
      metadata: { name: "Garden" },
      on: { on: true },
      dimming: { brightness: 100 },
      color_temperature: { mirek: 300 },
    },
  ],
  "/resource/zigbee_connectivity": [
    { id_v1: "/lights/1", status: "connected" },
    { id_v1: "/lights/2", status: "connected" },
    { id_v1: "/lights/3", status: "connectivity_issue" },
  ],
  "/resource/button": [
    {
      id_v1: "/sensors/1",
      button: {
        last_event: "short_release",
        button_report: {
          updated: new Date(NOW - 10_000).toISOString(),
          event: "short_release",
        },
      },
    },
    {
      id_v1: "/sensors/2",
      button: {
        last_event: "long_release",
        button_report: {
          updated: new Date(NOW - 3_600_000).toISOString(),
          event: "long_release",
        },
      },
    },
    {
      id_v1: "/sensors/3",
      button: {
        last_event: "initial_press",
        button_report: {
          updated: new Date(NOW).toISOString(),
          event: "initial_press",
        },
      },
    },
  ],
  "/resource/device": [
    { id_v1: "/sensors/1", metadata: { name: "Hallway switch" } },
    { id_v1: "/sensors/2", metadata: { name: "Office switch" } },
  ],
  "/resource/device_power": [
    {
      id_v1: "/sensors/1",
      power_state: { battery_state: "normal", battery_level: 90 },
    },
    {
      id_v1: "/sensors/2",
      power_state: { battery_state: "low", battery_level: 12 },
    },
  ],
};

describe("PhilipsHue", () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ["Date"], now: NOW });
  });

  afterEach(() => {
    mock.timers.reset();
    mock.restoreAll();
  });

  test("run reports lights and buttons from the bridge", async () => {
    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL) => {
        const { pathname } = new URL(input);
        const data = responses[pathname.replace("/clip/v2", "")];
        return Response.json({ errors: [], data });
      }
    );

    const data = await new PhilipsHue().run();

    assert.deepEqual(data, [
      {
        type: "light",
        name: "Kitchen",
        state: 1,
        brightness: 80,
        color_temperature: 366,
      },
      {
        type: "light",
        name: "Bedroom",
        state: 0,
        brightness: 0,
        color_temperature: 200,
      },
      // Unreachable lights are reported off
      { type: "light", name: "Garden", state: 0, brightness: 0 },
      // Recent event: reported with its timestamp
      {
        type: "button",
        name: "Hallway switch",
        event: "short_release",
        battery_state: "normal",
        battery_level: 90,
        timestamp: NOW - 10_000,
      },
      // Stale event: only the battery is reported
      {
        type: "button",
        name: "Office switch",
        battery_state: "low",
        battery_level: 12,
      },
      // Buttons without a device name are dropped
    ]);

    assert.equal(fetchMock.mock.callCount(), 5);
    const [url, init] = fetchMock.mock.calls[0].arguments as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    assert.equal(url, "https://hue.local/clip/v2/resource/light");
    assert.equal(init.headers["Hue-Application-Key"], "hue-user");
  });

  test("run throws on HTTP errors", async () => {
    mock.method(
      globalThis,
      "fetch",
      async () => new Response("Forbidden", { status: 403 })
    );

    await assert.rejects(new PhilipsHue().run(), /HTTP error! status: 403/);
  });
});
