import { AbstractPlugin } from "../shared/AbstractPlugin.mts";

type Token = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
};

type BalayDishwasherData = {
  type: "dishwasher";
  name: string;
  state: 0 | 1; // 0 = off/inactive, 1 = on/running
  door_state: 0 | 1; // 0 = closed, 1 = open
  operation_state: string;
  program_name?: string;
};

const CONFIG = ["BALAY_CLIENT_ID", "BALAY_CLIENT_SECRET"] as const;

const AUTHENTICATION_ERROR = new Error(
  "Authentication error: Run `raspbberry-home-monitor --setup --plugin balay-dishwasher to authenticate"
);

export class BalayDishwasher extends AbstractPlugin<
  BalayDishwasherData,
  typeof CONFIG,
  Token
> {
  public static readonly description = "Balay dishwasher via Home Connect API";
  private readonly baseUrl = "https://api.home-connect.com";

  constructor() {
    super(CONFIG);
  }

  /**
   * Initiates the OAuth device flow and returns the device code info
   */
  private initiateDeviceFlow() {
    return this.post("/security/oauth/device_authorization", {
      client_id: this.config.BALAY_CLIENT_ID,
    });
  }

  /**
   * Polls for the access token after user authorization
   */
  private async pollForToken({
    device_code,
    interval,
    expires_in,
  }: HomeConnectDeviceCodeResponse) {
    const expiresAt = Date.now() + expires_in * 1000;

    while (Date.now() < expiresAt) {
      await wait(interval);

      const response = await this.post("/security/oauth/token", {
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: this.config.BALAY_CLIENT_ID,
        device_code: device_code,
      });

      // authorization_pending means user hasn't authorized yet, keep polling
      if (response === "authorization_pending") {
        continue;
      }

      // slow_down means we need to increase polling interval
      if (response === "slow_down") {
        interval += 5;
        continue;
      }

      return response;
    }

    throw new Error("Device authorization timed out");
  }

  /**
   * Performs the complete device flow authentication
   */
  private async authenticateWithDeviceFlow() {
    const deviceCodeInfo = await this.initiateDeviceFlow();

    /* eslint-disable no-console */
    // Output authentication instructions (allowed in this specific case for user interaction)
    console.log("\n=== Home Connect Authorization Required ===");
    console.log(`1. Visit: ${deviceCodeInfo.verification_uri}`);
    console.log(`2. Enter code: ${deviceCodeInfo.user_code}`);

    if (deviceCodeInfo.verification_uri_complete) {
      console.log(
        `\nOr visit this URL directly: ${deviceCodeInfo.verification_uri_complete}`
      );
    }
    console.log("\nWaiting for authorization...");

    const tokenResponse = await this.pollForToken(deviceCodeInfo);

    const token: Token = {
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token || "",
      expires_at: Date.now() + tokenResponse.expires_in * 1000,
      token_type: tokenResponse.token_type,
    };

    console.log("Authentication successful");
    /* eslint-enable no-console */

    this.store.set(token);
  }

  /**
   * Refreshes the access token using the refresh token
   */
  private async refreshAccessToken(refreshToken: string): Promise<Token> {
    const tokenResponse = await this.post("/security/oauth/token", {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.config.BALAY_CLIENT_ID,
    });

    const token: Token = {
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token || refreshToken,
      expires_at: Date.now() + tokenResponse.expires_in * 1000,
      token_type: tokenResponse.token_type,
    };

    this.store.set(token);
    return token;
  }

  private async getValidAccessToken(): Promise<string> {
    let tokenData = this.store.get();

    if (!tokenData) {
      throw AUTHENTICATION_ERROR;
    }

    // If token is expired or will expire soon, refresh it
    if (tokenData.expires_at < Date.now()) {
      try {
        tokenData = await this.refreshAccessToken(tokenData.refresh_token);
      } catch {
        // If refresh fails, delete old token and initiate device flow again
        this.store.clear();
        throw AUTHENTICATION_ERROR;
      }
    }

    return tokenData.access_token;
  }

  private async handleError(response: Response): Promise<void> {
    const { error } = (await response.json()) as HomeConnectGetErrorResponse;

    throw new Error(
      `Failed to ${response.url.replace(this.baseUrl, "")}: ${
        response.status
      } ${response.statusText}`,
      { cause: new Error(error.description) }
    );
  }

  private async post<T extends PostEndpoint, U extends PostData<T>>(
    endpoint: T,
    data: U
  ): Promise<PostResponse<T, U>> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(data).toString(),
    });

    if (!response.ok) {
      const error = (await response.json()) as {
        error?: string;
      };

      if (error.error === "authorization_pending") {
        return "authorization_pending" as PostResponse<T, U>;
      }

      if (error.error === "slow_down") {
        return "slow_down" as PostResponse<T, U>;
      }

      throw new Error(
        `Failed to post ${endpoint}: ${response.status} ${response.statusText}`
      );
    }

    return (await response.json()) as PostResponse<T, U>;
  }

  private async get<T extends GetEndpoint>(
    endpoint: T
  ): Promise<GetResponse<T>> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${await this.getValidAccessToken()}`,
        Accept: "application/vnd.bsh.sdk.v1+json",
      },
    });

    if (!response.ok) {
      await this.handleError(response);
    }

    const { data } = (await response.json()) as {
      data: GetResponse<T>;
    };
    return data;
  }

  private processStatus(
    statusResponse: HomeConnectStatusResponse
  ): Pick<BalayDishwasherData, "state" | "door_state" | "operation_state"> {
    const statuses = new Map(statusResponse.status.map((s) => [s.key, s]));

    return {
      state:
        statuses.get(STATUS.OPERATION_STATE)?.value === OPERATION_STATE.RUN
          ? 1
          : 0,
      door_state:
        statuses.get(STATUS.DOOR_STATE)?.value === DOOR_STATE.OPEN ? 1 : 0,
      operation_state: statuses.get(STATUS.OPERATION_STATE)!.displayValue,
    };
  }

  async setup(): Promise<void> {
    await this.authenticateWithDeviceFlow();
  }

  async run(): Promise<BalayDishwasherData | undefined> {
    const appliances = await this.get("/api/homeappliances");
    const dishwasher = appliances.homeappliances.find(
      (appliance) => appliance.type === "Dishwasher"
    );

    if (!dishwasher) {
      return undefined;
    }

    const status = this.processStatus(
      await this.get(`/api/homeappliances/${dishwasher.haId}/status`)
    );

    const program =
      status.state === 1 // Dishwasher is running
        ? await this.get(
            `/api/homeappliances/${dishwasher.haId}/programs/active`
          )
        : undefined;

    return {
      type: "dishwasher",
      name: dishwasher.name,
      ...status,
      ...(program && { program_name: program.name }),
    } satisfies BalayDishwasherData;
  }
}

function wait(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

type PostEndpoint =
  | "/security/oauth/device_authorization"
  | "/security/oauth/token";

type PostPollTokenData = {
  grant_type: "urn:ietf:params:oauth:grant-type:device_code";
  device_code: string;
  client_id: string;
};

type PostRefreshTokenData = {
  grant_type: "refresh_token";
  refresh_token: string;
  client_id: string;
};

type PostData<T extends PostEndpoint> =
  T extends "/security/oauth/device_authorization"
    ? {
        client_id: string;
      }
    : T extends "/security/oauth/token"
    ? PostPollTokenData | PostRefreshTokenData
    : never;

type PostResponse<
  T extends PostEndpoint,
  U extends PostData<T>
> = T extends "/security/oauth/device_authorization"
  ? HomeConnectDeviceCodeResponse
  : T extends "/security/oauth/token"
  ? U extends PostPollTokenData
    ? "authorization_pending" | "slow_down" | HomeConnectTokenResponse
    : U extends PostRefreshTokenData
    ? HomeConnectTokenResponse
    : never
  : never;

type GetEndpoint =
  | "/api/homeappliances"
  | `/api/homeappliances/${string}/status`
  | `/api/homeappliances/${string}/programs/active`;

type GetResponse<T extends GetEndpoint> = T extends "/api/homeappliances"
  ? HomeConnectApplianceResponse
  : T extends `/api/homeappliances/${string}/status`
  ? HomeConnectStatusResponse
  : T extends `/api/homeappliances/${string}/programs/active`
  ? HomeConnectActiveProgramResponse
  : never;

type HomeConnectApplianceResponse = {
  homeappliances: HomeConnectAppliance[];
};

type HomeConnectStatusResponse = {
  status: HomeConnectStatus[];
};

type HomeConnectActiveProgramResponse = {
  data: HomeConnectProgram;
  name: string;
};

type HomeConnectProgram = {
  name: string;
};

type HomeConnectTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
};

type HomeConnectDeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
};

type HomeConnectAppliance = {
  haId: string;
  name: string;
  brand: string;
  vib: string;
  connected: boolean;
  type: "Dishwasher";
  enumber: string;
};

const STATUS = {
  DOOR_STATE: "BSH.Common.Status.DoorState",
  OPERATION_STATE: "BSH.Common.Status.OperationState",
} as const;

const DOOR_STATE = {
  CLOSED: "BSH.Common.EnumType.DoorState.Closed",
  OPEN: "BSH.Common.EnumType.DoorState.Open",
  LOCKED: "BSH.Common.EnumType.DoorState.Locked",
} as const;

const OPERATION_STATE = {
  INACTIVE: "BSH.Common.EnumType.OperationState.Inactive",
  READY: "BSH.Common.EnumType.OperationState.Ready",
  DELAYED_START: "BSH.Common.EnumType.OperationState.DelayedStart",
  RUN: "BSH.Common.EnumType.OperationState.Run",
  PAUSE: "BSH.Common.EnumType.OperationState.Pause",
  ACTION_REQUIRED: "BSH.Common.EnumType.OperationState.ActionRequired",
  FINISHED: "BSH.Common.EnumType.OperationState.Finished",
  ERROR: "BSH.Common.EnumType.OperationState.Error",
  ABORTING: "BSH.Common.EnumType.OperationState.Aborting",
} as const;

type HomeConnectStatus =
  | {
      key: (typeof STATUS)["DOOR_STATE"];
      value: (typeof DOOR_STATE)[keyof typeof DOOR_STATE];
      name: "Door";
      displayValue: string;
    }
  | {
      key: (typeof STATUS)["OPERATION_STATE"];
      value: (typeof OPERATION_STATE)[keyof typeof OPERATION_STATE];
      name: "Operation";
      displayValue: string;
    };

type HomeConnectGetErrorResponse = {
  error: {
    key: string;
    description: string;
  };
};
