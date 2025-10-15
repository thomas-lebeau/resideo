import { AbstractPlugin } from "../shared/AbstractPlugin.mts";

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
};

const CONFIG = ["ROUTER_HOST", "ROUTER_USERNAME", "ROUTER_PASSWORD"] as const;

/**
 * Monitors Huawei router WAN connection status
 *
 * Connects to a Huawei router (e.g., EG8147X6) and monitors the internet
 * connection status by checking WAN connection data.
 *
 * Environment variables:
 * - ROUTER_HOST: Router IP address (e.g., 192.168.18.1)
 * - ROUTER_USERNAME: Router admin username
 * - ROUTER_PASSWORD: Router admin password
 */
export class HuaweiRouter extends AbstractPlugin<WanConnection, typeof CONFIG> {
  static readonly description = "Huawei router WAN connection monitor";

  private sessionCookie: string | null = null;
  private readonly baseUrl: string;

  constructor() {
    super(CONFIG);
    this.baseUrl = `http://${this.config.ROUTER_HOST}`;
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

    // Base64 encode the password (router expects this)
    const encodedPassword = Buffer.from(this.config.ROUTER_PASSWORD).toString(
      "base64"
    );

    const formData = new URLSearchParams({
      UserName: this.config.ROUTER_USERNAME,
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
   * Fetches WAN connection list from router
   */
  private async getWanList(): Promise<string> {
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
      }
    );

    if (!response.ok) {
      // Try to re-authenticate if unauthorized
      if (response.status === 401 || response.status === 403) {
        this.sessionCookie = null;
        await this.login();
        return this.getWanList();
      }

      throw new Error(
        `Failed to get WAN list: ${response.status} ${response.statusText}`
      );
    }

    return response.text();
  }

  /**
   * Parses JavaScript response to extract WAN connection data
   */
  private parseWanConnections(jsCode: string): RawWanConnection[] {
    const connections: RawWanConnection[] = [];

    // Extract IPWanList array
    const ipWanMatch = jsCode.match(/var IPWanList = new Array\(([\s\S]*?)\);/);
    if (!ipWanMatch) {
      return connections;
    }

    // Extract individual WanIP constructor calls
    const wanIpPattern = /new WanIP\(([\s\S]*?)\)(?=,\s*(?:new WanIP|null))/g;
    let match;

    while ((match = wanIpPattern.exec(ipWanMatch[1])) !== null) {
      const args = this.parseConstructorArgs(match[1]);

      if (args.length >= 20) {
        // Extract data based on constructor parameter positions
        // Based on the WanIP constructor signature from the HAR analysis
        connections.push({
          domain: this.cleanString(args[0]),
          status: this.cleanString(args[4]),
          lastConnErr: this.cleanString(args[5]),
          name: this.cleanString(args[7]),
          serviceList: this.cleanString(args[25]).toUpperCase(),
          ipAddress: this.cleanString(args[14]),
          gateway: this.cleanString(args[16]),
          dnsServers: this.cleanString(args[19]).split(","),
          uptime: parseInt(this.cleanString(args[35]) || "0", 10),
          bytesReceived: 0, // Will be populated from stats if available
          bytesSent: 0,
        });
      }
    }

    // Try to extract traffic statistics
    const statsMatch = jsCode.match(
      /var WanEthIPStats = new Array\(([\s\S]*?)\);/
    );
    if (statsMatch) {
      const statsPattern =
        /new WaninfoStats\(([\s\S]*?)\)(?=,\s*(?:new WaninfoStats|null))/g;
      let statsIndex = 0;

      while (
        (match = statsPattern.exec(statsMatch[1])) !== null &&
        statsIndex < connections.length
      ) {
        const statsArgs = this.parseConstructorArgs(match[1]);
        if (statsArgs.length >= 3 && connections[statsIndex]) {
          connections[statsIndex].bytesSent = parseInt(
            this.cleanString(statsArgs[1]) || "0",
            10
          );
          connections[statsIndex].bytesReceived = parseInt(
            this.cleanString(statsArgs[2]) || "0",
            10
          );
        }
        statsIndex++;
      }
    }

    return connections;
  }

  /**
   * Parses constructor arguments from JavaScript string
   */
  private parseConstructorArgs(argsStr: string): string[] {
    const args: string[] = [];
    let current = "";
    let inString = false;
    let stringChar = "";
    let depth = 0;

    for (let i = 0; i < argsStr.length; i++) {
      const char = argsStr[i];

      if (!inString) {
        if (char === '"' || char === "'") {
          inString = true;
          stringChar = char;
          current += char;
        } else if (char === "," && depth === 0) {
          args.push(current.trim());
          current = "";
        } else {
          current += char;
          if (char === "(") depth++;
          if (char === ")") depth--;
        }
      } else {
        current += char;
        if (char === stringChar && argsStr[i - 1] !== "\\") {
          inString = false;
        }
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
    } satisfies WanConnection;
  }
}
