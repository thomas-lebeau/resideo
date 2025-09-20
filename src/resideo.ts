#!/usr/bin/env node

import { config } from './config.ts';
import { sendToDatadog } from './datadog.ts';
import { 
  ResideoTokenResponse, 
  ResideoDeviceResponse, 
  ThermostatData 
} from './types.ts';

/**
 * Gets OAuth access token from Resideo API
 */
async function getAccessToken(): Promise<string> {
  try {
    const basicAuth = Buffer.from(`${config.HW_API_KEY}:${config.HW_API_SECRET}`).toString('base64');
    
    const response = await fetch('https://api.honeywell.com/oauth2/accesstoken', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json() as ResideoTokenResponse;
    return data.access_token;
  } catch (error) {
    console.error('❌ Failed to get access token:', error);
    throw error;
  }
}

/**
 * Fetches thermostat data from Resideo API
 */
async function getThermostatData(accessToken: string): Promise<ResideoDeviceResponse> {
  try {
    const params = new URLSearchParams({
      apikey: config.HW_API_KEY,
      locationId: config.HW_LOCATION_ID,
    });
    
    const url = `https://api.honeywell.com/v2/devices/thermostats/${config.HW_DEVICE_ID}?${params}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'UserRefID': config.HW_USER_REF_ID,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json() as ResideoDeviceResponse;
    return data;
  } catch (error) {
    console.error('❌ Failed to fetch thermostat data:', error);
    throw error;
  }
}

/**
 * Processes raw thermostat data into a structured format
 */
function processThermostatData(data: ResideoDeviceResponse): ThermostatData {
  return {
    mode: data.changeableValues.mode,
    heatSetpoint: data.changeableValues.heatSetpoint,
    operationMode: data.operationStatus.mode,
    outdoorTemperature: data.outdoorTemperature,
    indoorTemperature: data.indoorTemperature,
  };
}

/**
 * Main function to collect and send thermostat data
 */
export async function collectThermostatData(): Promise<void> {
  try {
    console.log('🌡️  Collecting thermostat data...');
    
    // Get access token
    const accessToken = await getAccessToken();
    console.log('✅ Got access token');

    // Fetch thermostat data
    const rawData = await getThermostatData(accessToken);
    console.log('✅ Fetched thermostat data');

    // Process data
    const thermostatData = processThermostatData(rawData);
    console.log('📊 Processed data:', thermostatData);

    // Send to Datadog
    await sendToDatadog(thermostatData, 'resideo-gh-action', { 
      device: 'thermostat',
      location: config.HW_LOCATION_ID 
    });

  } catch (error) {
    console.error('❌ Failed to collect thermostat data:', error);
    process.exit(1);
  }
}

// Allow running this file directly
if (import.meta.url === `file://${process.argv[1]}`) {
  collectThermostatData();
}