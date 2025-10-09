import { AbstractPlugin, agent } from "../shared/index.mts";

type HueLight = {
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
};

type HueResponse = {
  data: HueLight[];
};

const STATUS = {
  Off: 0,
  On: 1,
};

type LightStatusData = {
  [lightName: string]: {
    status: (typeof STATUS)[keyof typeof STATUS];
    brightness: number;
  };
};

const CONFIG = ["HUE_USERNAME", "HUE_HOST"] as const;

export default class PhilipsHuePlugin extends AbstractPlugin<
  LightStatusData,
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

  private processLightData(hueData: HueResponse): LightStatusData {
    const lightStatus: LightStatusData = {};

    for (const light of hueData.data) {
      lightStatus[light.metadata.name] = {
        status: light.on.on ? STATUS.On : STATUS.Off,
        brightness: light.dimming.brightness,
      };
    }

    return lightStatus;
  }

  async run(): Promise<LightStatusData> {
    const rawData = await this.getHueLightData();
    const lightStatus = this.processLightData(rawData);

    return lightStatus;
  }
}
