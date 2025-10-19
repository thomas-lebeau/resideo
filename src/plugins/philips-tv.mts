import type { Other } from "../shared/index.mts";
import { AbstractPlugin, agent } from "../shared/index.mts";
import { createHash } from "node:crypto";

type PhilipsTVDevice = Other & {
  type: "philips_tv";
  power_state?: "On" | "Standby" | "StandbyKeep";
  volume?: number;
  muted?: boolean;
  ambilight_mode?: string;
};

type PowerStateResponse = {
  powerstate: "On" | "Standby" | "StandbyKeep";
};

type VolumeResponse = {
  current: number;
  min: number;
  max: number;
  muted: boolean;
};

type AmbilightModeResponse = {
  current: string;
};

const CONFIG = [
  "PHILIPS_TV_HOST",
  "PHILIPS_TV_DEVICE_ID",
  "PHILIPS_TV_AUTH_KEY",
] as const;

const STATE = {
  Off: 0,
  On: 1,
} as const;

export class PhilipsTV extends AbstractPlugin<PhilipsTVDevice, typeof CONFIG> {
  static readonly description = "Philips Android TV monitoring";
  private readonly baseUrl: string;

  constructor() {
    super(CONFIG);
    this.baseUrl = `https://${this.config.PHILIPS_TV_HOST}:1926/6`;
  }

  /**
   * Creates a digest authentication header
   */
  private createDigestAuth(
    method: string,
    path: string,
    response401: Response
  ): string {
    const wwwAuth = response401.headers.get("www-authenticate");
    if (!wwwAuth) {
      throw new Error("No WWW-Authenticate header found");
    }

    // Parse the WWW-Authenticate header
    const realm = wwwAuth.match(/realm="([^"]+)"/)?.[1] || "";
    const nonce = wwwAuth.match(/nonce="([^"]+)"/)?.[1] || "";
    const qop = wwwAuth.match(/qop="([^"]+)"/)?.[1] || "";

    const username = this.config.PHILIPS_TV_DEVICE_ID;
    const password = this.config.PHILIPS_TV_AUTH_KEY;

    // Calculate HA1
    const ha1 = createHash("md5")
      .update(`${username}:${realm}:${password}`)
      .digest("hex");

    // Calculate HA2
    const ha2 = createHash("md5").update(`${method}:${path}`).digest("hex");

    // Generate client nonce and nc
    const nc = "00000001";
    const cnonce = Math.random().toString(36).substring(2, 15);

    // Calculate response
    const responseHash = createHash("md5")
      .update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
      .digest("hex");

    // Build the Authorization header
    return `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${path}", qop=${qop}, nc=${nc}, cnonce="${cnonce}", response="${responseHash}"`;
  }

  /**
   * Makes an authenticated request to the Philips TV API
   */
  private async fetchWithAuth<T>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const path = `/6${endpoint}`;

    try {
      // First attempt without auth to get the challenge
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        // @ts-expect-error - dispatcher is not defined in the fetch API types
        dispatcher: agent,
      });

      if (response.status === 401) {
        // Create digest auth header from the challenge
        const authHeader = this.createDigestAuth("GET", path, response);

        // Retry with authentication
        const authResponse = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: authHeader,
            Accept: "application/json",
          },
          // @ts-expect-error - dispatcher is not defined in the fetch API types
          dispatcher: agent,
        });

        if (!authResponse.ok) {
          throw new Error(`HTTP error! status: ${authResponse.status}`);
        }

        return (await authResponse.json()) as T;
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      this.logger.debug(`Failed to fetch ${endpoint}`, { error });
      throw error;
    }
  }

  private async getPowerState(): Promise<
    PowerStateResponse["powerstate"] | undefined
  > {
    try {
      const response = await this.fetchWithAuth<PowerStateResponse>(
        "/powerstate"
      );
      return response.powerstate;
    } catch (error) {
      this.logger.debug("Failed to get power state", { error });
      return undefined;
    }
  }

  private async getVolume(): Promise<
    Pick<VolumeResponse, "current" | "muted"> | undefined
  > {
    try {
      const response = await this.fetchWithAuth<VolumeResponse>(
        "/audio/volume"
      );
      return {
        current: response.current,
        muted: response.muted,
      };
    } catch (error) {
      this.logger.debug("Failed to get volume", { error });
      return undefined;
    }
  }

  private async getAmbilightMode(): Promise<string | undefined> {
    try {
      const response = await this.fetchWithAuth<AmbilightModeResponse>(
        "/ambilight/mode"
      );
      return response.current;
    } catch (error) {
      this.logger.debug("Failed to get ambilight mode", { error });
      return undefined;
    }
  }

  async run(): Promise<PhilipsTVDevice> {
    const [powerState, volume, ambilightMode] = await Promise.all([
      this.getPowerState(),
      this.getVolume(),
      this.getAmbilightMode(),
    ]);

    const isOn = powerState === "On";

    return {
      type: "philips_tv",
      name: "Philips TV",
      state: isOn ? STATE.On : STATE.Off,
      ...(powerState && { power_state: powerState }),
      ...(volume && {
        volume: volume.current,
        muted: volume.muted,
      }),
      ...(ambilightMode && { ambilight_mode: ambilightMode }),
    };
  }
}
