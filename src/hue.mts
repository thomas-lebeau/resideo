import { Agent } from "undici";
import { config } from "./config.mts";
import { sendToDatadog } from "./datadog.mts";

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

/**
 * Processed light data for logging
 */
type LightStatus = {
  [lightName: string]: {
    status: boolean;
    brightness: number;
  };
};

const agent = new Agent({
  connect: {
    rejectUnauthorized: false,
  },
});

/**
 * Fetches light data from Philips Hue bridge
 */
async function getHueLightData(): Promise<HueResponse> {
  try {
    const url = `https://${config.HUE_HOST}/clip/v2/resource/light`;

    const response = await fetch(url, {
      headers: {
        "Hue-Application-Key": config.HUE_USERNAME,
      },
      // @ts-ignore
      dispatcher: agent,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = (await response.json()) as HueResponse;
    return data;
  } catch (error) {
    console.error("❌ Failed to fetch Hue light data:", error);
    throw error;
  }
}

/**
 * Processes raw Hue light data into a structured format
 */
function processLightData(hueData: HueResponse): LightStatus {
  const lightStatus: LightStatus = {};

  for (const light of hueData.data) {
    lightStatus[light.metadata.name] = {
      status: light.on.on,
      brightness: light.dimming.brightness,
    };
  }

  return lightStatus;
}

/**
 * Main function to collect and send Hue light data
 */
export async function collectHueLightData(): Promise<void> {
  try {
    console.log("💡 Collecting Hue light data...");

    // Fetch light data
    const rawData = await getHueLightData();
    console.log("✅ Fetched Hue light data");

    // Process data
    const lightStatus = processLightData(rawData);
    console.log("📊 Processed light data:", lightStatus);

    // Send to Datadog
    await sendToDatadog(lightStatus, "raspberry-pi", {
      device: "hue-lights",
      total_lights: Object.keys(lightStatus).length.toString(),
    });
  } catch (error) {
    console.error("❌ Failed to collect Hue light data:", error);
    process.exit(1);
  }
}
