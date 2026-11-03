import type { Thermometer, Thermostat } from "../shared/AbstractPlugin.mts";
import { AbstractPlugin } from "../shared/AbstractPlugin.mts";

type ResideoTokenResponse = {
  access_token: string;
  token_type: string;
  // Lifetime in seconds. The API returns it as a string, e.g. "1799".
  expires_in: string | number;
};

type Token = {
  access_token: string;
  expires_at: number;
};

/**
 * Request a new token this long before the cached one expires, so a request
 * never goes out with a token that expires on the way.
 */
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

type ResideoDeviceResponse = {
  name: string;
  changeableValues: {
    mode: string;
    heatSetpoint: number;
    coolSetpoint?: number;
  };
  operationStatus: {
    mode: string;
  };
  outdoorTemperature: number;
  indoorTemperature: number;
  displayedOutdoorHumidity: number;
};

type OnOff = Thermostat["state"];

/**
 * Thermostat system mode (`changeableValues.mode`): off, or on in any mode
 */
const MODE: Record<string, OnOff> = {
  Off: 0,
  Heat: 1,
  Cool: 1,
  Auto: 1,
  EmergencyHeat: 1,
};

/**
 * What the equipment is currently doing (`operationStatus.mode`)
 */
const OPERATION_MODE: Record<string, OnOff> = {
  EquipmentOff: 0,
  Heat: 1,
  Cool: 1,
};

const CONFIG = [
  "HW_API_KEY",
  "HW_API_SECRET",
  "HW_DEVICE_ID",
  "HW_LOCATION_ID",
  "HW_USER_REF_ID",
] as const;

export class Resideo extends AbstractPlugin<
  Thermometer | Thermostat,
  typeof CONFIG
> {
  static readonly description = "Resideo/Honeywell thermostat and sensors";

  private readonly baseUrl = "https://api.honeywellhome.com";

  constructor() {
    super(CONFIG);
  }

  /**
   * Returns the cached OAuth access token, or requests a new one from the
   * Resideo API when there is none or it is about to expire.
   */
  private async getAccessToken(): Promise<string> {
    const { access_token, expires_at } = this.store.get() ?? {};

    if (
      typeof access_token === "string" &&
      typeof expires_at === "number" &&
      expires_at - TOKEN_EXPIRY_MARGIN_MS > Date.now()
    ) {
      return access_token;
    }

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
    const expiresIn = Number(data.expires_in);

    if (Number.isFinite(expiresIn)) {
      const token: Token = {
        access_token: data.access_token,
        expires_at: Date.now() + expiresIn * 1000,
      };
      this.store.set(token);
    }

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

    if (response.status === 401) {
      // The cached token was revoked or expired early: request a new one on the next run
      this.store.clear();
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = (await response.json()) as ResideoDeviceResponse;
    return data;
  }

  /**
   * Maps a Resideo mode to on/off, reporting unknown modes as off
   */
  private toOnOff(
    modes: Record<string, OnOff>,
    mode: string,
    field: string
  ): OnOff {
    if (Object.hasOwn(modes, mode)) {
      return modes[mode];
    }

    this.logger.warn(`Unknown ${field} "${mode}", reporting it as off`, {
      field,
      mode,
    });
    return 0;
  }

  private processThermostatData(data: ResideoDeviceResponse) {
    return [
      {
        type: "thermostat",
        name: data.name,
        state: this.toOnOff(
          MODE,
          data.changeableValues.mode,
          "changeableValues.mode"
        ),
        target: data.changeableValues.heatSetpoint,
        operation_mode: this.toOnOff(
          OPERATION_MODE,
          data.operationStatus.mode,
          "operationStatus.mode"
        ),
      },
      {
        type: "thermometer",
        name: `${data.name} (indoor)`,
        temperature: data.indoorTemperature,
      },
      {
        type: "thermometer",
        name: `${data.name} (outdoor)`,
        temperature: data.outdoorTemperature,
        humidity: data.displayedOutdoorHumidity,
      },
    ] satisfies Array<Thermostat | Thermometer>;
  }

  async run() {
    const accessToken = await this.getAccessToken();
    const rawData = await this.getThermostatData(accessToken);
    const thermostatData = this.processThermostatData(rawData);

    return thermostatData satisfies Array<Thermostat | Thermometer>;
  }
}
