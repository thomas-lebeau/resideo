import axios from 'axios';
import { config } from './config';
import { DatadogLogPayload } from './types';

/**
 * Sends data to Datadog logs API
 */
export async function sendToDatadog(
  data: any, 
  source: string,
  tags: Record<string, string> = {}
): Promise<void> {
  try {
    const tagString = Object.entries({ version: '2.0', ...tags })
      .map(([key, value]) => `${key}:${value}`)
      .join(',');

    const url = `https://http-intake.logs.datadoghq.eu/api/v2/logs?ddsource=${source}&ddtags=${tagString}`;
    
    const payload: DatadogLogPayload = {
      message: typeof data === 'string' ? data : JSON.stringify(data),
      timestamp: new Date().toISOString(),
      ...data
    };

    await axios.post(url, payload, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'DD-API-KEY': config.DD_API_KEY,
      },
    });

    console.log(`✅ Successfully sent ${source} data to Datadog`);
  } catch (error) {
    console.error(`❌ Failed to send data to Datadog:`, error);
    throw error;
  }
}