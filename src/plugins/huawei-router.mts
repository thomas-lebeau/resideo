import { AbstractPlugin } from "../shared/AbstractPlugin.mts";
import { HTTP_TIMEOUT } from "../shared/timeout.mts";

type RawWanConnection = {
  domain: string;
  status: string;
  lastConnErr: string;
  name: string;
  serviceList: string;
  ipAddress: string;
  gateway: string;
  dnsServers: string[];
  uptime: number;
  bytesReceived: number;
  bytesSent: number;
};

type WanConnection = {
  type: "wan_connection";
  name: string;
  state: 0 | 1; // 0 = down, 1 = up
  ip_address?: string;
  gateway?: string;
  dns_servers?: string[];
  uptime?: number;
  bytes_received?: number;
  bytes_sent?: number;
  optical_rx_power_dbm?: number;
  pon_mode?: string;
  gpon_status?: string;
  ont_registration_state?: "registered" | "not_registered";
};

type OpticalInfo = Pick<
  WanConnection,
  | "optical_rx_power_dbm"
  | "pon_mode"
  | "gpon_status"
  | "ont_registration_state"
>;

const CONFIG = [
  "HUAWEI_ROUTER_HOST",
  "HUAWEI_ROUTER_USERNAME",
  "HUAWEI_ROUTER_PASSWORD",
] as const;

const IP_WAN_LIST_PATTERN = /var IPWanList = new Array\(([\s\S]*?)\);/;

/**
 * Monitors Huawei router WAN connection status
 *
 * Connects to a Huawei router (e.g., EG8147X6) and monitors the internet
 * connection status by checking WAN connection data.
 *
 * Environment variables:
 * - HUAWEI_ROUTER_HOST: Router IP address (e.g., 192.168.0.1)
 * - HUAWEI_ROUTER_USERNAME: Router admin username
 * - HUAWEI_ROUTER_PASSWORD: Router admin password
 */
export class HuaweiRouter extends AbstractPlugin<WanConnection, typeof CONFIG> {
  static readonly description = "Huawei router WAN and optical connection monitor";

  private sessionCookie: string | null = null;
  private csrfToken: string | null = null;
  private readonly baseUrl: string;

  constructor() {
    super(CONFIG);
    this.baseUrl = `http://${this.config.HUAWEI_ROUTER_HOST}`;
  }

  /**
   * Gets CSRF token from router
   */
  private async getToken(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/asp/GetRandCount.asp`, {
      method: "POST",
      headers: {
        "Content-Length": "0",
      },
      signal: AbortSignal.timeout(HTTP_TIMEOUT),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to get token: ${response.status} ${response.statusText}`
      );
    }

    const token = await response.text();
    return token.trim();
  }

  /**
   * Authenticates with the router
   */
  private async login(): Promise<void> {
    const token = await this.getToken();
    this.csrfToken = token;

    // Base64 encode the password (router expects this)
    const encodedPassword = Buffer.from(
      this.config.HUAWEI_ROUTER_PASSWORD
    ).toString("base64");

    const formData = new URLSearchParams({
      UserName: this.config.HUAWEI_ROUTER_USERNAME,
      PassWord: encodedPassword,
      Language: "english",
      "x.X_HW_Token": token,
    });

    const response = await fetch(`${this.baseUrl}/login.cgi`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
      redirect: "manual", // Don't follow redirects automatically
      signal: AbortSignal.timeout(HTTP_TIMEOUT),
    });

    // Extract session cookie
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      // Extract the cookie name=value part (before the semicolon)
      const cookieMatch = setCookie.match(/^([^;]+)/);
      if (cookieMatch) {
        this.sessionCookie = cookieMatch[1];
      }
    }

    if (!response.ok && response.status !== 302) {
      throw new Error(
        `Login failed: ${response.status} ${response.statusText}`
      );
    }
  }

  /**
   * Fetches WAN connection list from router, logging in again once if the
   * session is rejected or expired
   */
  private async getWanList(retried = false): Promise<string> {
    if (!this.sessionCookie) {
      await this.login();
    }

    const response = await fetch(
      `${this.baseUrl}/html/bbsp/common/wan_list.asp`,
      {
        headers: {
          Cookie: this.sessionCookie || "",
          Referer: `${this.baseUrl}/CustomApp/mainpage.asp`,
        },
        signal: AbortSignal.timeout(HTTP_TIMEOUT),
      }
    );

    const unauthorized = response.status === 401 || response.status === 403;

    if (!response.ok && !unauthorized) {
      throw new Error(
        `Failed to get WAN list: ${response.status} ${response.statusText}`
      );
    }

    // An expired session is answered with 401/403, or with a 200 login page
    const jsCode = await response.text();

    if (unauthorized || !IP_WAN_LIST_PATTERN.test(jsCode)) {
      if (retried) {
        throw new Error(
          unauthorized
            ? `Failed to get WAN list after logging in again: ${response.status} ${response.statusText}`
            : "Failed to get WAN list after logging in again: no IPWanList in the response"
        );
      }

      this.sessionCookie = null;
      return this.getWanList(true);
    }

    return jsCode;
  }

  /**
   * Fetches optical and PON diagnostics from the router's main-page
   * diagnostics endpoint. The response is JavaScript, not JSON.
   */
  private async getOpticalInfo(): Promise<OpticalInfo> {
    if (!this.sessionCookie || !this.csrfToken) {
      return {};
    }

    const response = await fetch(
      `${this.baseUrl}/html/amp/common/getSmartDiagnoseResult.asp`,
      {
        method: "POST",
        headers: {
          Cookie: this.sessionCookie,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Referer: `${this.baseUrl}/CustomApp/mainpage.asp`,
          "X-Requested-With": "XMLHttpRequest",
        },
        body: new URLSearchParams({
          "x.X_HW_Token": this.csrfToken,
        }).toString(),
        signal: AbortSignal.timeout(HTTP_TIMEOUT),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Failed to get optical information: ${response.status} ${response.statusText}`
      );
    }

    return this.parseOpticalInfo(await response.text());
  }

  /**
   * Reads a string-valued variable from the router's JavaScript response.
   * This deliberately extracts the original declaration: the page's
   * getResult() function later overwrites opticInfo with "ok" or "nok".
   */
  private readStringVariable(source: string, name: string): string | undefined {
    const singleQuotedPattern = new RegExp(
      "\\bvar\\s+" + name + "\\s*=\\s*'([^']*)'\\s*;",
      "s"
    );
    const doubleQuotedPattern = new RegExp(
      '\\bvar\\s+' + name + '\\s*=\\s*"([^"]*)"\\s*;',
      "s"
    );
    const match =
      source.match(singleQuotedPattern) ?? source.match(doubleQuotedPattern);
    return match ? this.cleanString("'" + match[1] + "'") : undefined;
  }

  /**
   * Parses the optical receive level and derives registration state from
   * the PON mode/status values exposed by the router.
   */
  private parseOpticalInfo(jsCode: string): OpticalInfo {
    const opticInfo = this.readStringVariable(jsCode, "opticInfo");
    const ponMode = this.readStringVariable(jsCode, "ontPonMode");
    const gponStatus = this.readStringVariable(jsCode, "gponStatus");
    const eponStatus = this.readStringVariable(jsCode, "eponStatus");

    const rxPower =
      opticInfo && opticInfo !== "--" ? Number(opticInfo) : Number.NaN;
    const mode = ponMode?.toUpperCase();
    let registered: boolean | undefined;

    if (mode === "GPON" && gponStatus) {
      registered = gponStatus.toUpperCase() === "O5";
    } else if (mode === "EPON" && eponStatus) {
      registered = eponStatus.toUpperCase() === "ONLINE";
    }

    return {
      ...(Number.isFinite(rxPower) ? { optical_rx_power_dbm: rxPower } : {}),
      ...(ponMode ? { pon_mode: ponMode.toLowerCase() } : {}),
      ...(gponStatus ? { gpon_status: gponStatus } : {}),
      ...(registered === undefined
        ? {}
        : {
            ont_registration_state: registered
              ? "registered"
              : "not_registered",
          }),
    };
  }

  /**
   * Parses JavaScript response to extract WAN connection data
   */
  private parseWanConnections(jsCode: string): RawWanConnection[] {
    const connections: RawWanConnection[] = [];

    const ipWanMatch = jsCode.match(IP_WAN_LIST_PATTERN);
    if (!ipWanMatch) {
      return connections;
    }

    for (const argsString of this.parseConstructorCalls(ipWanMatch[1], "WanIP")) {
      const args = this.parseConstructorArgs(argsString);

      // Uptime is argument 42 in the WanIP signature. Earlier firmware
      // parsers incorrectly read argument 35 (MaxMTUSize).
      if (args.length <= 42) {
        continue;
      }

      const serviceList =
        this.cleanString(args[26]) || this.cleanString(args[25]);

      connections.push({
        domain: this.cleanString(args[0]),
        status: this.cleanString(args[4]),
        lastConnErr: this.cleanString(args[5]),
        name: this.cleanString(args[7]),
        serviceList: serviceList.toUpperCase(),
        ipAddress: this.cleanString(args[14]),
        gateway: this.cleanString(args[16]),
        dnsServers: this.cleanString(args[19]).split(","),
        uptime: Number.parseInt(this.cleanString(args[42]), 10) || 0,
        bytesReceived: 0,
        bytesSent: 0,
      });
    }

    // WAN statistics are keyed by the WAN domain with a ".Stats" suffix.
    // Match by domain rather than relying on the order of the two arrays.
    const statsMatch = jsCode.match(
      /var WanEthIPStats = new Array\(([\s\S]*?)\);/
    );
    if (statsMatch) {
      for (const argsString of this.parseConstructorCalls(
        statsMatch[1],
        "WaninfoStats"
      )) {
        const statsArgs = this.parseConstructorArgs(argsString);
        if (statsArgs.length < 3) {
          continue;
        }

        const domain = this.cleanString(statsArgs[0]).replace(/\.Stats$/, "");
        const connection = connections.find((item) => item.domain === domain);
        if (!connection) {
          continue;
        }

        connection.bytesSent =
          Number.parseInt(this.cleanString(statsArgs[1]), 10) || 0;
        connection.bytesReceived =
          Number.parseInt(this.cleanString(statsArgs[2]), 10) || 0;
      }
    }

    return connections;
  }

  /**
   * Extracts the argument text from each call to a named JavaScript
   * constructor, respecting nested parentheses and quoted strings.
   */
  private parseConstructorCalls(
    source: string,
    constructorName: string
  ): string[] {
    const calls: string[] = [];
    const pattern = new RegExp(`new\\s+${constructorName}\\s*\\(`, "g");
    while (pattern.exec(source) !== null) {
      const start = pattern.lastIndex;
      let depth = 1;
      let inString = false;
      let stringChar = "";
      let escaped = false;

      for (let i = start; i < source.length; i++) {
        const char = source[i];

        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (char === "\\") {
            escaped = true;
          } else if (char === stringChar) {
            inString = false;
          }
          continue;
        }

        if (char === '"' || char === "'") {
          inString = true;
          stringChar = char;
        } else if (char === "(") {
          depth++;
        } else if (char === ")") {
          depth--;
          if (depth === 0) {
            calls.push(source.slice(start, i));
            pattern.lastIndex = i + 1;
            break;
          }
        }
      }
    }

    return calls;
  }

  /**
   * Parses constructor arguments from JavaScript string
   */
  private parseConstructorArgs(argsStr: string): string[] {
    const args: string[] = [];
    let current = "";
    let inString = false;
    let stringChar = "";
    let escaped = false;
    let depth = 0;

    for (let i = 0; i < argsStr.length; i++) {
      const char = argsStr[i];

      if (inString) {
        current += char;
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === stringChar) {
          inString = false;
        }
        continue;
      }

      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
        current += char;
      } else if (char === "," && depth === 0) {
        args.push(current.trim());
        current = "";
      } else {
        current += char;
        if (char === "(" || char === "[" || char === "{") depth++;
        if (char === ")" || char === "]" || char === "}") depth--;
      }
    }

    if (current.trim()) {
      args.push(current.trim());
    }

    return args;
  }

  /**
   * Cleans escaped strings from JavaScript
   */
  private cleanString(str: string): string {
    return str
      .replace(/^["']|["']$/g, "") // Remove surrounding quotes
      .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      ) // Decode hex escapes
      .replace(/\\x5f/gi, "_") // Decode underscore
      .replace(/\\x2e/gi, ".") // Decode period
      .replace(/\\x2c/gi, ",") // Decode comma
      .replace(/\\x3a/gi, ":"); // Decode colon
  }

  /**
   * Finds the primary internet connection from WAN list
   */
  private findInternetConnection(
    connections: RawWanConnection[]
  ): RawWanConnection | null {
    // Look for connection with INTERNET in service list
    const internetConnections = connections.filter((conn) =>
      conn.serviceList.includes("INTERNET")
    );

    if (internetConnections.length === 0) {
      return null;
    }

    // Prefer connected connections
    const connected = internetConnections.find(
      (conn) => conn.status === "Connected" && conn.lastConnErr === "ERROR_NONE"
    );

    return connected || internetConnections[0];
  }

  /**
   * Determines if the connection is up based on WAN data
   */
  private isConnectionUp(connection: RawWanConnection): boolean {
    return (
      connection.status === "Connected" &&
      connection.lastConnErr === "ERROR_NONE" &&
      connection.ipAddress !== "0.0.0.0" &&
      connection.ipAddress !== ""
    );
  }

  async run() {
    const jsCode = await this.getWanList();
    const connections = this.parseWanConnections(jsCode);
    const internetConnection = this.findInternetConnection(connections);

    if (!internetConnection) {
      return undefined;
    }

    const isUp = this.isConnectionUp(internetConnection);
    let opticalInfo: OpticalInfo = {};

    try {
      opticalInfo = await this.getOpticalInfo();
    } catch (error) {
      // WAN status remains useful even if this firmware does not expose
      // optical diagnostics or the diagnostics endpoint is temporarily down.
      this.logger.debug("Failed to collect optical information", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      type: "wan_connection",
      name: internetConnection.name,
      state: isUp ? 1 : 0,
      ip_address: internetConnection.ipAddress,
      gateway: internetConnection.gateway,
      dns_servers: internetConnection.dnsServers.filter((dns) => dns !== ""),
      uptime: internetConnection.uptime,
      bytes_received: internetConnection.bytesReceived,
      bytes_sent: internetConnection.bytesSent,
      ...opticalInfo,
    } satisfies WanConnection;
  }
}
