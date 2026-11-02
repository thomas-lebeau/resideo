import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";

process.env.HUE_HOST = "hue.local";
process.env.HUE_USERNAME = "hue-user";

const { PhilipsHue } = await import("./philips-hue.mts");

type Internals = {
  processEventStreamMessage(message: string): void;
};

const NOW = Date.parse("2026-01-01T12:00:00.000Z");
const EVENT_STREAM_PATH = "/eventstream/clip/v2";

function buttonReport(event: string, time: number) {
  return { event, updated: new Date(time).toISOString() };
}

function buttonResource(id: string, id_v1: string, event: string, time: number) {
  return {
    id,
    id_v1,
    button: { last_event: event, button_report: buttonReport(event, time) },
  };
}

function eventStreamMessage(
  ...buttons: Array<{ id: string; event: string; time: number }>
) {
  return JSON.stringify([
    {
      type: "update",
      data: buttons.map(({ id, event, time }) => ({
        id,
        type: "button",
        button: { last_event: event, button_report: buttonReport(event, time) },
      })),
    },
  ]);
}

let responses: Record<string, unknown[]>;

function defaultResponses(): Record<string, unknown[]> {
  return {
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
      buttonResource("button-1", "/sensors/1", "short_release", NOW - 10_000),
      buttonResource("button-2", "/sensors/2", "long_release", NOW - 3_600_000),
      buttonResource("button-3", "/sensors/3", "initial_press", NOW),
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
}

function setButtonReport(id: string, event: string, time: number) {
  const button = (
    responses["/resource/button"] as Array<ReturnType<typeof buttonResource>>
  ).find((button) => button.id === id)!;

  button.button = { last_event: event, button_report: buttonReport(event, time) };
}

/**
 * Mocks the bridge: the REST API serves `responses`, the event stream sends
 * `streamMessages` then stays open
 */
function mockBridge(streamMessages: string[] = []) {
  return mock.method(globalThis, "fetch", async (input: string | URL) => {
    const { pathname } = new URL(input);

    if (pathname === EVENT_STREAM_PATH) {
      const body = new ReadableStream({
        start(controller) {
          for (const message of streamMessages) {
            controller.enqueue(new TextEncoder().encode(`data: ${message}\n\n`));
          }
        },
      });

      return new Response(body, {
        headers: { "Content-Type": "text/event-stream" },
      });
    }

    const data = responses[pathname.replace("/clip/v2", "")];
    return Response.json({ errors: [], data });
  });
}

function buttonLogs(data: unknown) {
  return (data as Array<{ type: string }>).filter(
    (log) => log.type === "button"
  );
}

const HALLWAY = {
  type: "button",
  name: "Hallway switch",
  battery_state: "normal",
  battery_level: 90,
} as const;

const OFFICE_BATTERY = {
  type: "button",
  name: "Office switch",
  battery_state: "low",
  battery_level: 12,
} as const;

describe("PhilipsHue", () => {
  beforeEach(() => {
    responses = defaultResponses();
    mock.timers.enable({ apis: ["Date"], now: NOW });
  });

  afterEach(async () => {
    await new PhilipsHue().stop();
    mock.timers.reset();
    mock.restoreAll();
  });

  test("run reports lights and buttons from the bridge", async () => {
    const fetchMock = mockBridge();

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
      { ...HALLWAY, event: "short_release", timestamp: NOW - 10_000 },
      // Stale event: only the battery is reported
      OFFICE_BATTERY,
      // Buttons without a device name are dropped
    ]);

    const calls = fetchMock.mock.calls.map(
      (call) =>
        call.arguments as unknown as [
          string,
          { headers: Record<string, string>; dispatcher?: unknown },
        ]
    );
    const urls = calls.map(([url]) => String(url));

    assert.deepEqual(urls.sort(), [
      "https://hue.local/clip/v2/resource/button",
      "https://hue.local/clip/v2/resource/device",
      "https://hue.local/clip/v2/resource/device_power",
      "https://hue.local/clip/v2/resource/light",
      "https://hue.local/clip/v2/resource/zigbee_connectivity",
      "https://hue.local/eventstream/clip/v2",
    ]);

    for (const [, init] of calls) {
      assert.equal(init.headers["Hue-Application-Key"], "hue-user");
      assert.ok(init.dispatcher, "uses the agent accepting the bridge certificate");
    }
  });

  test("run does not report the same polled event twice", async () => {
    mockBridge();

    await new PhilipsHue().run();
    mock.timers.setTime(NOW + 30_000);
    const data = await new PhilipsHue().run();

    assert.deepEqual(buttonLogs(data), [HALLWAY, OFFICE_BATTERY]);
  });

  test("run reports a polled event older than a minute if it was not reported yet", async () => {
    mockBridge();

    await new PhilipsHue().run();
    setButtonReport("button-2", "short_release", NOW + 10_000);
    // The next run is late: the event is 80s old
    mock.timers.setTime(NOW + 90_000);
    const data = await new PhilipsHue().run();

    assert.deepEqual(buttonLogs(data), [
      HALLWAY,
      { ...OFFICE_BATTERY, event: "short_release", timestamp: NOW + 10_000 },
    ]);
  });

  test("run reports every streamed event since the last run, oldest first", async () => {
    mockBridge();

    await new PhilipsHue().run();

    const plugin = new PhilipsHue() as unknown as Internals;
    plugin.processEventStreamMessage(
      eventStreamMessage(
        { id: "button-1", event: "initial_press", time: NOW + 1_000 },
        { id: "button-2", event: "initial_press", time: NOW + 2_000 }
      )
    );
    plugin.processEventStreamMessage(
      eventStreamMessage(
        { id: "button-1", event: "short_release", time: NOW + 1_200 },
        { id: "button-2", event: "long_release", time: NOW + 4_000 },
        { id: "unknown", event: "short_release", time: NOW + 5_000 }
      )
    );
    // The bridge only returns the last event of each button
    setButtonReport("button-1", "short_release", NOW + 1_200);
    setButtonReport("button-2", "long_release", NOW + 4_000);

    mock.timers.setTime(NOW + 60_000);
    const data = await new PhilipsHue().run();

    assert.deepEqual(buttonLogs(data), [
      { ...HALLWAY, event: "initial_press", timestamp: NOW + 1_000 },
      { ...HALLWAY, event: "short_release", timestamp: NOW + 1_200 },
      { ...OFFICE_BATTERY, event: "initial_press", timestamp: NOW + 2_000 },
      { ...OFFICE_BATTERY, event: "long_release", timestamp: NOW + 4_000 },
    ]);

    // Streamed events are reported once
    mock.timers.setTime(NOW + 120_000);
    assert.deepEqual(buttonLogs(await new PhilipsHue().run()), [
      HALLWAY,
      OFFICE_BATTERY,
    ]);
  });

  test("processEventStreamMessage ignores other resources and invalid messages", async () => {
    mockBridge();

    await new PhilipsHue().run();

    const plugin = new PhilipsHue() as unknown as Internals;
    plugin.processEventStreamMessage("not json");
    plugin.processEventStreamMessage(
      JSON.stringify([
        { type: "update", data: [{ id: "light-1", type: "light", on: { on: true } }] },
        {
          type: "add",
          data: [
            {
              id: "button-1",
              type: "button",
              button: { button_report: buttonReport("short_release", NOW + 1_000) },
            },
          ],
        },
      ])
    );

    mock.timers.setTime(NOW + 60_000);
    assert.deepEqual(buttonLogs(await new PhilipsHue().run()), [
      HALLWAY,
      OFFICE_BATTERY,
    ]);
  });

  test("run collects button events from the event stream", async () => {
    const message = eventStreamMessage({
      id: "button-1",
      event: "short_release",
      time: NOW + 1_000,
    });
    mockBridge([message]);

    const plugin = new PhilipsHue();
    const received = new Promise<string>((resolve) => {
      mock.method(
        plugin as unknown as Internals,
        "processEventStreamMessage",
        resolve
      );
    });

    await plugin.run();

    assert.equal(await received, message);
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
