import { EventSource } from "eventsource";
import type { Light } from "../shared/index.mts";
import { AbstractPlugin, agent } from "../shared/index.mts";

type AbstractButton = {
  type: "button";
  name: string;
};

type ButtonWithEvent = AbstractButton & {
  event: ButtonEvent;
  battery_state: BatteryState | "n/a";
  battery_level?: number;
  timestamp: number;
};

type ButtonWithoutEvent = AbstractButton & {
  battery_state: BatteryState;
  battery_level: number;
};

type Button = ButtonWithEvent | ButtonWithoutEvent;

type LightResponse = Array<{
  id_v1: string;
  metadata: {
    name: string;
  };
  on: {
    on: boolean;
  };
  // Absent on lights without dimming (e.g. smart plugs)
  dimming?: {
    brightness: number;
  };
  // Absent on lights without colour temperature (e.g. colour-only bulbs)
  color_temperature?: {
    // minimum: 50, maximum: 1000
    mirek: number;
  };
}>;

type ZigbeeConnectivityResponse = Array<{
  id_v1: string;
  status: "connected" | "disconnected" | "connectivity_issue";
}>;

type BatteryState = "normal" | "low" | "critical";
type DevicePowerResponse = Array<{
  id_v1: string;
  power_state: {
    battery_state: BatteryState;
    battery_level: number;
  };
}>;

type ButtonEvent =
  | "initial_press"
  | "repeat"
  | "short_release"
  | "long_release"
  | "double_short_release"
  | "long_press";

type ButtonReport = {
  updated: string;
  event: ButtonEvent;
};

type ButtonResponse = Array<{
  id: string;
  id_v1: string;
  button: {
    last_event: ButtonEvent;
    button_report?: ButtonReport;
  };
}>;

/**
 * Message of the `/eventstream/clip/v2` event stream: each container lists
 * the resources that changed
 */
type EventStreamMessage = Array<{
  type: "add" | "update" | "delete" | "error";
  data: Array<{
    id: string;
    type: string;
    button?: {
      button_report?: ButtonReport;
    };
  }>;
}>;

type DeviceResponse = Array<{
  id_v1: string;
  metadata: {
    name: string;
  };
}>;

type Endpoint =
  | "/resource/light"
  | "/resource/button"
  | "/resource/device_power"
  | "/resource/device"
  | "/resource/zigbee_connectivity";

type Response<T extends Endpoint> = T extends "/resource/light"
  ? LightResponse
  : T extends "/resource/device_power"
  ? DevicePowerResponse
  : T extends "/resource/button"
  ? ButtonResponse
  : T extends "/resource/device"
  ? DeviceResponse
  : T extends "/resource/zigbee_connectivity"
  ? ZigbeeConnectivityResponse
  : unknown;

const STATE = {
  Off: 0,
  On: 1,
} as const;

const CONFIG = ["HUE_USERNAME", "HUE_HOST"] as const;
const ONE_MINUTE = 60_000 as const;
/** How long (bridge clock) an event is remembered after a newer one, to deduplicate it */
const REPORT_RETENTION = 10 * ONE_MINUTE;

let instance: PhilipsHue | undefined;

export class PhilipsHue extends AbstractPlugin<Light | Button, typeof CONFIG> {
  static readonly description = "Philips Hue lights and buttons";

  private eventSource: EventSource | undefined;
  /** Button reports received from the event stream since the last run, by button id */
  private pendingReports = new Map<string, ButtonReport[]>();
  /**
   * Events already reported (or deliberately skipped), by button id: the time
   * (bridge clock) of each event, by `reportKey`
   */
  private readonly seenReports = new Map<string, Map<string, number>>();

  constructor() {
    // A new plugin is created on every run: reuse the instance to keep the
    // event stream and the reported events across runs
    if (instance) {
      return instance;
    }

    super(CONFIG);

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    instance = this;
  }

  private get baseUrl(): string {
    return `https://${this.config.HUE_HOST}/clip/v2`;
  }

  private async fetch<T extends Endpoint>(endpoint: T): Promise<Response<T>> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: {
        "Hue-Application-Key": this.config.HUE_USERNAME,
      },
      // @ts-expect-error - dispatcher is not defined in the fetch API types
      dispatcher: agent,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const { data } = (await response.json()) as { data: Response<T> };
    return data;
  }

  private processLightResponse(
    lightResponse: Response<"/resource/light">,
    connectivityResponse: Response<"/resource/zigbee_connectivity">
  ): Array<Light | undefined> {
    return lightResponse.map((light) => {
      const connectivity = connectivityResponse.find(
        (conn) => conn.id_v1 === light.id_v1
      );

      const reachable = connectivity?.status === "connected";

      if (!reachable) {
        return {
          type: "light",
          name: light.metadata.name,
          state: STATE.Off,
          brightness: 0,
        } as const;
      }

      return {
        type: "light",
        name: light.metadata.name,
        state: light.on.on ? STATE.On : STATE.Off,
        ...(light.dimming && { brightness: light.dimming.brightness }),
        ...(light.color_temperature && {
          color_temperature: light.color_temperature.mirek,
        }),
      } as const;
    });
  }

  private startEventStream() {
    this.eventSource = new EventSource(
      `https://${this.config.HUE_HOST}/eventstream/clip/v2`,
      {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            headers: {
              ...init.headers,
              "Hue-Application-Key": this.config.HUE_USERNAME,
            },
            // @ts-expect-error - dispatcher is not defined in the fetch API types
            dispatcher: agent,
          }),
      }
    );

    this.eventSource.onmessage = (event) =>
      this.processEventStreamMessage(event.data);

    // The stream reconnects by itself, and `run` restarts it if it gave up
    this.eventSource.onerror = (event) =>
      this.logger.debug(`Event stream error: ${event.message}`);
  }

  private processEventStreamMessage(message: string) {
    let containers: EventStreamMessage;

    try {
      containers = JSON.parse(message) as EventStreamMessage;
    } catch {
      this.logger.warn(`Ignoring invalid event stream message: ${message}`);
      return;
    }

    for (const container of containers) {
      if (container.type !== "update") {
        continue;
      }

      for (const resource of container.data) {
        const report =
          resource.type === "button" ? resource.button?.button_report : undefined;

        if (report) {
          const reports = this.pendingReports.get(resource.id) ?? [];
          reports.push(report);
          this.pendingReports.set(resource.id, reports);
        }
      }
    }
  }

  /**
   * Events of the button that were not reported yet, oldest first: the ones
   * received from the event stream, plus the last one polled from the bridge
   * in case the stream missed it.
   *
   * Events are deduplicated by identity rather than by a time watermark, so a
   * streamed event delivered after a newer polled one is still reported, and
   * the local clock is never compared with the bridge's after the first run.
   */
  private takeNewReports(
    button: ButtonResponse[number],
    streamedReports: ButtonReport[]
  ): ButtonReport[] {
    const polledReport = button.button.button_report;
    const firstSeen = !this.seenReports.has(button.id);
    const seen = this.seenReports.get(button.id) ?? new Map<string, number>();
    this.seenReports.set(button.id, seen);

    const reports = [...streamedReports];

    // The first time a button is seen, its last event may be long gone: only
    // report it if it is recent. It is remembered below either way.
    if (
      polledReport &&
      (!firstSeen || reportTime(polledReport) > Date.now() - ONE_MINUTE)
    ) {
      reports.push(polledReport);
    }

    // Events older than the retention were forgotten: ignore them
    const oldest = Math.max(...Array.from(seen.values())) - REPORT_RETENTION;
    const newReports: ButtonReport[] = [];

    for (const report of reports.sort(byUpdated)) {
      const key = reportKey(report);

      if (reportTime(report) >= oldest && !seen.has(key)) {
        seen.set(key, reportTime(report));
        newReports.push(report);
      }
    }

    if (polledReport) {
      seen.set(reportKey(polledReport), reportTime(polledReport));
    }

    const newest = Math.max(...Array.from(seen.values()));
    seen.forEach((time, key) => {
      if (time < newest - REPORT_RETENTION) {
        seen.delete(key);
      }
    });

    return newReports;
  }

  private processButtonResponse(
    buttonResponse: Response<"/resource/button">,
    deviceResponse: Response<"/resource/device">,
    devicePowerResponse: Response<"/resource/device_power">
  ): Button[] {
    // Take the streamed reports: those of unknown buttons are dropped
    const pendingReports = this.pendingReports;
    this.pendingReports = new Map();

    return buttonResponse.flatMap((button): Button[] => {
      const device = deviceResponse.find(
        (device) => device.id_v1 === button.id_v1
      );
      const devicePower = devicePowerResponse.find(
        (devicePower) => devicePower.id_v1 === button.id_v1
      );

      const { battery_level, battery_state } = devicePower?.power_state ?? {};
      const reports = this.takeNewReports(
        button,
        pendingReports.get(button.id) ?? []
      );
      const name = device?.metadata.name;

      if (!name) {
        return [];
      }

      if (reports.length > 0) {
        // Report every event since the last run
        return reports.map(
          ({ event, updated }) =>
            ({
              type: "button",
              name,
              event,
              battery_state: battery_state ?? "n/a",
              ...(battery_level ? { battery_level } : {}),
              // Use the event timestamp
              timestamp: new Date(updated).getTime(),
            }) satisfies ButtonWithEvent
        );
      } else if (battery_level && battery_state) {
        // Report only battery level if there is no new event
        return [
          {
            type: "button",
            name,
            battery_state,
            battery_level,
          } satisfies ButtonWithoutEvent,
        ];
      }

      return [];
    });
  }

  async stop() {
    this.eventSource?.close();
    this.eventSource = undefined;
    instance = undefined;
  }

  async run() {
    if (
      !this.eventSource ||
      this.eventSource.readyState === EventSource.CLOSED
    ) {
      this.startEventStream();
    }

    const [
      lightResponse,
      connectivityResponse,
      buttonResponse,
      deviceResponse,
      devicePowerResponse,
    ] = await Promise.all([
      this.fetch("/resource/light"),
      this.fetch("/resource/zigbee_connectivity"),
      this.fetch("/resource/button"),
      this.fetch("/resource/device"),
      this.fetch("/resource/device_power"),
    ]);

    return [
      ...this.processLightResponse(lightResponse, connectivityResponse),
      ...this.processButtonResponse(
        buttonResponse,
        deviceResponse,
        devicePowerResponse
      ),
    ].filter((log) => log !== undefined);
  }
}

function reportTime(report: ButtonReport): number {
  return new Date(report.updated).getTime();
}

function reportKey(report: ButtonReport): string {
  return `${report.updated}|${report.event}`;
}

function byUpdated(a: ButtonReport, b: ButtonReport): number {
  return reportTime(a) - reportTime(b);
}
