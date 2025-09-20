import * as dotenv from 'dotenv';
import { Config } from './types.ts';

// Load environment variables from .env file
dotenv.config();

/**
 * Validates that all required environment variables are present
 */
function validateConfig(): Config {
  const requiredVars = [
    'HW_API_KEY',
    'HW_API_SECRET', 
    'HW_DEVICE_ID',
    'HW_LOCATION_ID',
    'HW_USER_REF_ID',
    'HUE_HOST',
    'HUE_USERNAME',
    'DD_API_KEY'
  ] as const;

  const missing = requiredVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    HW_API_KEY: process.env.HW_API_KEY!,
    HW_API_SECRET: process.env.HW_API_SECRET!,
    HW_DEVICE_ID: process.env.HW_DEVICE_ID!,
    HW_LOCATION_ID: process.env.HW_LOCATION_ID!,
    HW_USER_REF_ID: process.env.HW_USER_REF_ID!,
    HUE_HOST: process.env.HUE_HOST!,
    HUE_USERNAME: process.env.HUE_USERNAME!,
    DD_API_KEY: process.env.DD_API_KEY!,
  };
}

/**
 * Configuration object with all environment variables
 * Lazy-loaded to avoid errors when just showing help
 */
let _config: Config | null = null;
export const config = new Proxy({} as Config, {
  get(_, prop: keyof Config) {
    if (!_config) {
      _config = validateConfig();
    }
    return _config[prop];
  }
});