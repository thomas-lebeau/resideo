import { Agent } from "undici";

/**
 * Philips Hue light data from API
 */
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

/**
 * Hue API response
 */
type HueResponse = {
  data: HueLight[];
};

const STATUS = {
  Off: 0,
  On: 1,
};

/**
 * Processed light data for logging
 */
type LightStatus = {
  [lightName: string]: {
    status: (typeof STATUS)[keyof typeof STATUS];
    brightness: number;
  };
};

const CONFIG = {
  HUE_USERNAME: process.env.HUE_USERNAME,
  HUE_HOST: process.env.HUE_HOST,
};

const BASE_URL = `https://${CONFIG.HUE_HOST}/clip/v2/resource/light`;

const agent = new Agent({
  connect: {
    rejectUnauthorized: false,
  },
});

/**
 * Fetches light data from Philips Hue bridge
 */
async function getHueLightData(): Promise<HueResponse> {
  if (!CONFIG.HUE_USERNAME) {
    throw new Error("HUE_USERNAME is not set");
  }

  if (!CONFIG.HUE_HOST) {
    throw new Error("HUE_HOST is not set");
  }

  const response = await fetch(BASE_URL, {
    headers: {
      "Hue-Application-Key": CONFIG.HUE_USERNAME,
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

/**
 * Processes raw Hue light data into a structured format
 */
function processLightData(hueData: HueResponse): LightStatus {
  const lightStatus: LightStatus = {};

  for (const light of hueData.data) {
    lightStatus[light.metadata.name] = {
      status: light.on.on ? STATUS.On : STATUS.Off,
      brightness: light.dimming.brightness,
    };
  }

  return lightStatus;
}

/**
 * Main function to collect and send Hue light data
 */
export default async function collectHueLightData(): Promise<LightStatus | void> {
  const rawData = await getHueLightData();
  const lightStatus = processLightData(rawData);

  return lightStatus;
}
