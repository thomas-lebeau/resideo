/**
 * Resideo API OAuth token response
 */
type ResideoTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

/**
 * Resideo thermostat device response
 */
type ResideoDeviceResponse = {
  changeableValues: {
    mode: "Off" | "Heat";
    heatSetpoint: number;
    coolSetpoint?: number;
  };
  operationStatus: {
    mode: "EquipmentOff" | "Heat";
  };
  outdoorTemperature: number;
  indoorTemperature: number;
};

const MODE = {
  Off: 0,
  Heat: 1,
} as const;

const OPERATION_MODE = {
  EquipmentOff: 0,
  Heat: 1,
} as const;

/**
 * Processed thermostat data for logging
 */
type ThermostatData = {
  mode: (typeof MODE)[keyof typeof MODE];
  operation_mode: (typeof OPERATION_MODE)[keyof typeof OPERATION_MODE];
  in_temp: number;
  out_temp: number;
  target_temp: number;
};

const BASE_URL = "https://api.honeywell.com/v2/devices/thermostats";

const CONFIG = {
  API_KEY: process.env.HW_API_KEY,
  API_SECRET: process.env.HW_API_SECRET,
  DEVICE_ID: process.env.HW_DEVICE_ID,
  LOCATION_ID: process.env.HW_LOCATION_ID,
  USER_REF_ID: process.env.HW_USER_REF_ID,
};

/**
 * Gets OAuth access token from Resideo API
 */
async function getAccessToken(): Promise<string> {
  if (!CONFIG.API_KEY) {
    throw new Error("HW_API_KEY is not set");
  }

  if (!CONFIG.API_SECRET) {
    throw new Error("HW_API_SECRET is not set");
  }

  const basicAuth = Buffer.from(
    `${CONFIG.API_KEY}:${CONFIG.API_SECRET}`
  ).toString("base64");

  const response = await fetch("https://api.honeywell.com/oauth2/accesstoken", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = (await response.json()) as ResideoTokenResponse;
  return data.access_token;
}

/**
 * Fetches thermostat data from Resideo API
 */
async function getThermostatData(
  accessToken: string
): Promise<ResideoDeviceResponse> {
  if (!CONFIG.API_KEY) {
    throw new Error("HW_API_KEY is not set");
  }

  if (!CONFIG.LOCATION_ID) {
    throw new Error("HW_LOCATION_ID is not set");
  }

  if (!CONFIG.DEVICE_ID) {
    throw new Error("HW_DEVICE_ID is not set");
  }

  if (!CONFIG.USER_REF_ID) {
    throw new Error("HW_USER_REF_ID is not set");
  }

  const params = new URLSearchParams({
    apikey: CONFIG.API_KEY,
    locationId: CONFIG.LOCATION_ID,
  });

  const response = await fetch(`${BASE_URL}/${CONFIG.DEVICE_ID}?${params}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      UserRefID: CONFIG.USER_REF_ID,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = (await response.json()) as ResideoDeviceResponse;
  return data;
}

function processThermostatData(data: ResideoDeviceResponse): ThermostatData {
  return {
    mode: data.changeableValues.mode === "Heat" ? MODE.Heat : MODE.Off,
    target_temp: data.changeableValues.heatSetpoint,
    operation_mode:
      data.operationStatus.mode === "Heat"
        ? OPERATION_MODE.Heat
        : OPERATION_MODE.EquipmentOff,
    out_temp: data.outdoorTemperature,
    in_temp: data.indoorTemperature,
  };
}

/**
 * Main function to collect and send thermostat data
 */
export default async function collectThermostatData(): Promise<ThermostatData | void> {
  const accessToken = await getAccessToken();
  const rawData = await getThermostatData(accessToken);
  const thermostatData = processThermostatData(rawData);

  return thermostatData;
}
