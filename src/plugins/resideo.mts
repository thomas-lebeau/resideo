import { AbstractPlugin } from "../shared/AbstractPlugin.mts";

type ResideoTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

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

type ThermostatData = {
  mode: (typeof MODE)[keyof typeof MODE];
  operation_mode: (typeof OPERATION_MODE)[keyof typeof OPERATION_MODE];
  in_temp: number;
  out_temp: number;
  target_temp: number;
};

const CONFIG = [
  "HW_API_KEY",
  "HW_API_SECRET",
  "HW_DEVICE_ID",
  "HW_LOCATION_ID",
  "HW_USER_REF_ID",
] as const;

export default class ResideoPlugin extends AbstractPlugin<
  ThermostatData,
  typeof CONFIG
> {
  private readonly baseUrl = "https://api.honeywell.com";

  constructor() {
    super(CONFIG);
  }

  /**
   * Gets OAuth access token from Resideo API
   */
  private async getAccessToken(): Promise<string> {
    const basicAuth = Buffer.from(
      `${this.config.HW_API_KEY}:${this.config.HW_API_SECRET}`
    ).toString("base64");

    const response = await fetch(`${this.baseUrl}/oauth2/accesstoken`, {
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

  private async getThermostatData(
    accessToken: string
  ): Promise<ResideoDeviceResponse> {
    const params = new URLSearchParams({
      apikey: this.config.HW_API_KEY,
      locationId: this.config.HW_LOCATION_ID,
    });

    const response = await fetch(
      `${this.baseUrl}/v2/devices/thermostats/${this.config.HW_DEVICE_ID}?${params}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          UserRefID: this.config.HW_USER_REF_ID,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = (await response.json()) as ResideoDeviceResponse;
    return data;
  }

  private processThermostatData(data: ResideoDeviceResponse): ThermostatData {
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

  async run() {
    const accessToken = await this.getAccessToken();
    const rawData = await this.getThermostatData(accessToken);
    const thermostatData = this.processThermostatData(rawData);

    return thermostatData;
  }
}
