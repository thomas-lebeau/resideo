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
  dimming: {
    brightness: number;
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

type ButtonResponse = Array<{
  id_v1: string;
  button: {
    last_event: ButtonEvent;
    button_report: {
      updated: string;
      event: ButtonEvent;
    };
  };
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

export class PhilipsHue extends AbstractPlugin<Light | Button, typeof CONFIG> {
  static readonly description = "Philips Hue lights and buttons";
  private readonly baseUrl: string;

  constructor() {
    super(CONFIG);

    this.baseUrl = `https://${this.config.HUE_HOST}/clip/v2`;
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

      return {
        type: "light",
        name: light.metadata.name,
        state:
          connectivity?.status !== "connected"
            ? STATE.Off
            : light.on.on
            ? STATE.On
            : STATE.Off,
        brightness: light.dimming.brightness,
      } as const;
    });
  }

  private processButtonResponse(
    buttonResponse: Response<"/resource/button">,
    deviceResponse: Response<"/resource/device">,
    devicePowerResponse: Response<"/resource/device_power">
  ): Array<Button | undefined> {
    return buttonResponse.map((button) => {
      const device = deviceResponse.find(
        (device) => device.id_v1 === button.id_v1
      );
      const devicePower = devicePowerResponse.find(
        (devicePower) => devicePower.id_v1 === button.id_v1
      );

      const { battery_level, battery_state } = devicePower?.power_state ?? {};
      const { event, updated } = button.button.button_report ?? {};
      const name = device?.metadata.name;

      if (!name) {
        return;
      }

      if (elapsed(updated) < ONE_MINUTE) {
        // Report last event if it has been updated in the last minute
        return {
          type: "button",
          name,
          event,
          battery_state: battery_state ?? "n/a",
          ...(battery_level ? { battery_level } : {}),
          // Use the last event timestamp
          timestamp: new Date(updated).getTime(),
        } satisfies ButtonWithEvent;
      } else if (battery_level && battery_state) {
        // Report only battery level if last event has not been updated in the last minute
        return {
          type: "button",
          name,
          battery_state,
          battery_level,
        } satisfies ButtonWithoutEvent;
      }

      return;
    });
  }

  async run() {
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

function elapsed(updated: string): number {
  return Date.now() - new Date(updated).getTime();
}
