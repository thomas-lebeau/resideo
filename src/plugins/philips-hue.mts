import type { LightBulb } from "../shared/index.mts";
import { AbstractPlugin, agent, toKebabCase } from "../shared/index.mts";

type HueResponse = {
  data: Array<{
    id: string;
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
};

const STATE = {
  Off: 0,
  On: 1,
} as const;

const CONFIG = ["HUE_USERNAME", "HUE_HOST"] as const;

export default class PhilipsHuePlugin extends AbstractPlugin<
  LightBulb,
  typeof CONFIG
> {
  private readonly baseUrl: string;

  constructor() {
    super(CONFIG);

    this.baseUrl = `https://${this.config.HUE_HOST}/clip/v2/resource/light`;
  }

  private async getHueLightData(): Promise<HueResponse> {
    const response = await fetch(this.baseUrl, {
      headers: {
        "Hue-Application-Key": this.config.HUE_USERNAME,
      },
      // @ts-expect-error - dispatcher is not defined in the fetch API types
      dispatcher: agent,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = (await response.json()) as HueResponse;
    return data;
  }

  private processLightData(hueData: HueResponse) {
    return hueData.data.map((light) => {
      return {
        type: "lightbulb",
        name: toKebabCase(light.metadata.name),
        state: light.on.on ? STATE.On : STATE.Off,
        brightness: light.dimming.brightness,
      } as const;
    });
  }

  async run() {
    const rawData = await this.getHueLightData();
    const lightStatus = this.processLightData(rawData);

    return lightStatus;
  }
}
