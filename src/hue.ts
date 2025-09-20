#!/usr/bin/env ts-node

import axios from 'axios';
import https from 'https';
import { config } from './config.js';
import { sendToDatadog } from './datadog.js';
import { HueResponse, LightStatus } from './types.js';

/**
 * Creates an HTTPS agent that ignores SSL certificate errors
 * (needed for local Hue bridge communication)
 */
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

/**
 * Fetches light data from Philips Hue bridge
 */
async function getHueLightData(): Promise<HueResponse> {
  try {
    const url = `https://${config.HUE_HOST}/clip/v2/resource/light`;
    
    const response = await axios.get<HueResponse>(url, {
      headers: {
        'Hue-Application-Key': config.HUE_USERNAME,
      },
      httpsAgent,
    });

    return response.data;
  } catch (error) {
    console.error('❌ Failed to fetch Hue light data:', error);
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
    console.log('💡 Collecting Hue light data...');
    
    // Fetch light data
    const rawData = await getHueLightData();
    console.log('✅ Fetched Hue light data');

    // Process data
    const lightStatus = processLightData(rawData);
    console.log('📊 Processed light data:', lightStatus);

    // Send to Datadog
    await sendToDatadog(lightStatus, 'raspberry-pi', { 
      device: 'hue-lights',
      total_lights: Object.keys(lightStatus).length.toString()
    });

  } catch (error) {
    console.error('❌ Failed to collect Hue light data:', error);
    process.exit(1);
  }
}

// Allow running this file directly
if (import.meta.url === `file://${process.argv[1]}`) {
  collectHueLightData();
}