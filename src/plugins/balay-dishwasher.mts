import { AbstractPlugin } from "../shared/AbstractPlugin.mts";
import { EventSource } from "eventsource";
import { toKebabCase } from "../shared/toKebabCase.mts";

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
  half_load?: boolean;
  active_program?: string;
};

const CONFIG = ["BALAY_CLIENT_ID", "BALAY_CLIENT_SECRET"] as const;

const AUTHENTICATION_ERROR = new Error(
  "Authentication error: Run `raspbberry-home-monitor --setup --plugin balay-dishwasher to authenticate"
);

// hack to make this a singleton
let instance: BalayDishwasher | undefined;

export class BalayDishwasher extends AbstractPlugin<
  BalayDishwasherData,
  typeof CONFIG,
  Token
> {
  public static readonly description = "Balay dishwasher via Home Connect API";

  private readonly baseUrl = "https://api.home-connect.com";

  private haId: string | undefined;
  private state: DishwasherState | undefined;
  private eventSource: EventSource | undefined;

  constructor() {
    if (instance) {
      return instance;
    }

    super(CONFIG);

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    instance = this;
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

  private async initializeState() {
    const appliances = await this.get("/api/homeappliances");
    const dishwasher = appliances.homeappliances.find(
      (appliance) => appliance.type === "Dishwasher"
    );

    if (!dishwasher) {
      throw new Error("No dishwasher appliance found");
    }

    this.haId = dishwasher.haId;

    const status = this.processStatus(
      await this.get(`/api/homeappliances/${this.haId}/status`)
    );

    const program =
      status.operation_state === OPERATION_STATE.RUN
        ? await this.get(`/api/homeappliances/${this.haId}/programs/active`)
        : undefined;

    this.state = {
      name: dishwasher.name,
      door_state: status.door_state,
      operation_state: status.operation_state,
      active_program: program?.key,
    };
  }

  private async startEventStream() {
    this.eventSource = new EventSource(
      `${this.baseUrl}/api/homeappliances/${this.haId}/events`,
      {
        fetch: async (input, init) =>
          fetch(input, {
            ...init,
            headers: {
              ...init.headers,
              Authorization: `Bearer ${await this.getValidAccessToken()}`,
            },
          }),
      }
    );

    this.eventSource.addEventListener("STATUS", (event) => {
      this.processEvent(JSON.parse(event.data) as HomeConnectEventData);
    });

    this.eventSource.addEventListener("NOTIFY", (event) => {
      this.processEvent(JSON.parse(event.data) as HomeConnectEventData);
    });
  }

  private processEvent(event: HomeConnectEventData) {
    if (!this.state) return;

    for (const item of event.items) {
      switch (item.key) {
        case STATUS.OPERATION_STATE:
          this.state.operation_state = item.value;
          break;
        case STATUS.DOOR_STATE:
          this.state.door_state = item.value;
          break;
        case STATUS.POWER_STATE:
          this.state.power_state = item.value;
          break;
        case NOTIFICATIONS.HALF_LOAD:
          this.state.half_load = item.value;
          break;
        case NOTIFICATIONS.ACTIVE_PROGRAM:
          this.state.active_program = item.value;
          break;
      }
    }
  }

  private processStatus(
    statusResponse: HomeConnectStatusResponse
  ): Pick<DishwasherState, "door_state" | "operation_state"> {
    const statuses = new Map(statusResponse.status.map((s) => [s.key, s]));

    return {
      door_state: statuses.get(STATUS.DOOR_STATE)!
        .value as (typeof DOOR_STATE)[keyof typeof DOOR_STATE],
      operation_state: statuses.get(STATUS.OPERATION_STATE)!
        .value as (typeof OPERATION_STATE)[keyof typeof OPERATION_STATE],
    };
  }

  private processState(
    state: DishwasherState
  ): BalayDishwasherData | undefined {
    const isRunning = state.operation_state === OPERATION_STATE.RUN;

    const data: BalayDishwasherData = {
      type: "dishwasher",
      name: state.name,
      state: isRunning ? STATE.ON : STATE.OFF,
      door_state: state.door_state === DOOR_STATE.OPEN ? STATE.ON : STATE.OFF,
    };

    if (isRunning) {
      data.half_load = !!state.half_load;
      data.active_program = state.active_program
        ? getProgramName(state.active_program)
        : "n/a";
    }

    return data;
  }

  async setup() {
    await this.authenticateWithDeviceFlow();
  }

  async stop() {
    if (this.eventSource) {
      this.eventSource.close();
    }
  }

  async run(): Promise<BalayDishwasherData | undefined> {
    if (!this.state || !this.haId) {
      await this.initializeState();

      this.startEventStream();
    }

    return this.processState(this.state!);
  }
}

function wait(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

function getProgramName(program: (typeof PROGRAMS)[keyof typeof PROGRAMS]) {
  return toKebabCase(program.replace("Dishcare.Dishwasher.Program.", ""));
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
  status: [
    HomeConnectStatus<typeof STATUS.DOOR_STATE>,
    HomeConnectStatus<typeof STATUS.OPERATION_STATE>
  ];
};

type HomeConnectActiveProgramResponse = {
  key: (typeof PROGRAMS)[keyof typeof PROGRAMS];
  // options:
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

type DishwasherState = {
  name: string;
  power_state?: (typeof POWER_STATE)[keyof typeof POWER_STATE];
  door_state: (typeof DOOR_STATE)[keyof typeof DOOR_STATE];
  operation_state:
    | (typeof OPERATION_STATE)[keyof typeof OPERATION_STATE]
    | undefined;
  active_program: (typeof PROGRAMS)[keyof typeof PROGRAMS] | undefined;
  half_load?: boolean;
};

const STATE = {
  OFF: 0,
  ON: 1,
} as const;

const STATUS = {
  DOOR_STATE: "BSH.Common.Status.DoorState",
  OPERATION_STATE: "BSH.Common.Status.OperationState",
  POWER_STATE: "BSH.Common.Setting.PowerState",
} as const;

const NOTIFICATIONS = {
  ACTIVE_PROGRAM: "BSH.Common.Root.ActiveProgram",
  HALF_LOAD: "Dishcare.Dishwasher.Option.HalfLoad",
} as const;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const POWER_STATE = {
  ON: "BSH.Common.EnumType.PowerState.On",
  OFF: "BSH.Common.EnumType.PowerState.Off",
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PROGRAMS = {
  PRE_RINSE: "Dishcare.Dishwasher.Program.PreRinse",
  AUTO_1: "Dishcare.Dishwasher.Program.Auto1",
  AUTO_2: "Dishcare.Dishwasher.Program.Auto2",
  AUTO_3: "Dishcare.Dishwasher.Program.Auto3",
  ECO_50: "Dishcare.Dishwasher.Program.Eco50",
  QUICK_45: "Dishcare.Dishwasher.Program.Quick45",
  INTENSIV_70: "Dishcare.Dishwasher.Program.Intensiv70",
  NORMAL_65: "Dishcare.Dishwasher.Program.Normal65",
  GLASS_40: "Dishcare.Dishwasher.Program.Glas40",
  GLASS_CARE: "Dishcare.Dishwasher.Program.GlassCare",
  NIGHT_WASH: "Dishcare.Dishwasher.Program.NightWash",
  QUICK_65: "Dishcare.Dishwasher.Program.Quick65",
  NORMAL_45: "Dishcare.Dishwasher.Program.Normal45",
  INTENSIV_45: "Dishcare.Dishwasher.Program.Intensiv45",
  AUTO_HALF_LOAD: "Dishcare.Dishwasher.Program.AutoHalfLoad",
  INTENSIV_POWER: "Dishcare.Dishwasher.Program.IntensivPower",
  MAGIC_DAILY: "Dishcare.Dishwasher.Program.MagicDaily",
  SUPER_60: "Dishcare.Dishwasher.Program.Super60",
  KURZ_60: "Dishcare.Dishwasher.Program.Kurz60",
  EXPRESS_SPARKLE_65: "Dishcare.Dishwasher.Program.ExpressSparkle65",
  MACHINE_CARE: "Dishcare.Dishwasher.Program.MachineCare",
  STEAM_FRESH: "Dishcare.Dishwasher.Program.SteamFresh",
  MAXIMUM_CLEANING: "Dishcare.Dishwasher.Program.MaximumCleaning",
  MIXED_LOAD: "Dishcare.Dishwasher.Program.MixedLoad",
} as const;

type HomeConnectStatus<T extends (typeof STATUS)[keyof typeof STATUS]> =
  T extends (typeof STATUS)["DOOR_STATE"]
    ? {
        key: T;
        value: (typeof DOOR_STATE)[keyof typeof DOOR_STATE];
      }
    : T extends (typeof STATUS)["OPERATION_STATE"]
    ? {
        key: T;
        value: (typeof OPERATION_STATE)[keyof typeof OPERATION_STATE];
      }
    : T extends (typeof STATUS)["POWER_STATE"]
    ? {
        key: T;
        value: (typeof POWER_STATE)[keyof typeof POWER_STATE];
      }
    : never;

type HomeConnectNotification<
  T extends (typeof NOTIFICATIONS)[keyof typeof NOTIFICATIONS]
> = T extends (typeof NOTIFICATIONS)["HALF_LOAD"]
  ? {
      key: T;
      value: boolean;
    }
  : T extends (typeof NOTIFICATIONS)["ACTIVE_PROGRAM"]
  ? {
      key: T;
      value: (typeof PROGRAMS)[keyof typeof PROGRAMS];
    }
  : never;

type HomeConnectGetErrorResponse = {
  error: {
    key: string;
    description: string;
  };
};

type HomeConnectEventData = {
  items: Array<
    | HomeConnectStatus<(typeof STATUS)[keyof typeof STATUS]>
    | HomeConnectNotification<
        (typeof NOTIFICATIONS)[keyof typeof NOTIFICATIONS]
      >
  >;
};
