import { AbstractPlugin } from "../shared/AbstractPlugin.mts";
import { HTTP_TIMEOUT } from "../shared/timeout.mts";
import ouiData from "oui-data" with { type: "json" };

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

type PonStatus =
  | "initializing"
  | "standby"
  | "discovering"
  | "ranging"
  | "operational"
  | "recovering"
  | "emergency_stop"
  | "unknown";

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
  pon_mode?: "gpon" | "epon";
  pon_status?: PonStatus;
};

type OpticalInfo = Pick<
  WanConnection,
  | "optical_rx_power_dbm"
  | "pon_mode"
  | "pon_status"
>;

type LanDevice = {
  type: "lan_device";
  name: string;
  ip_address?: string;
  mac_address?: string;
  hostname?: string;
  manufacturer?: string;
  status?: string;
  port?: string;
  ip_type?: string;
  dev_type?: string;
  port_type?: string;
  device_type?: string;
  user_device_alias?: string;
  user_specified_device_type?: string;
  ipv4_enabled?: string;
  ipv6_enabled?: string;
  lease_time_remaining?: number | string;
  dhcp_address_source?: string;
  dhcp_interface_type?: string;
  dhcp_device_type?: string;
};

type RawLanDevice = {
  domain: string; ipAddress: string; macAddress: string; port: string;
  ipType: string; devType: string; devStatus: string; portType: string;
  hostName: string; ipv4Enabled: string; ipv6Enabled: string;
  deviceType: string; userDevAlias: string; userSpecifiedDeviceType: string;
  leaseTimeRemaining: string;
};

type RawDhcpLease = {
  domain: string; name: string; ipAddress: string; macAddress: string;
  remainingTime: string; deviceType: string; interfaceType: string;
  addressSource: string;
};

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
export class HuaweiRouter extends AbstractPlugin<
  WanConnection | LanDevice,
  typeof CONFIG
> {
  static readonly description = "Huawei router WAN, optical, and LAN monitor";

  private sessionCookie: string | null = null;
  private csrfToken: string | null = null;
  private readonly baseUrl: string;
  private readonly deviceNames: Map<string, string>;

  constructor() {
    super(CONFIG);
    this.baseUrl = `http://${this.config.HUAWEI_ROUTER_HOST}`;
    this.deviceNames = new Map();
    const configuredNames = process.env.HUAWEI_ROUTER_DEVICE_NAMES;
    if (configuredNames) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(configuredNames);
      } catch {
        throw new Error("HUAWEI_ROUTER_DEVICE_NAMES must be a JSON object mapping MAC addresses to friendly names");
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("HUAWEI_ROUTER_DEVICE_NAMES must be a JSON object mapping MAC addresses to friendly names");
      }
      for (const [mac, name] of Object.entries(parsed)) {
        if (typeof name !== "string" || !name.trim()) {
          throw new Error(`Invalid friendly name for MAC address ${mac}`);
        }
        const normalizedMac = this.normalizeMac(mac);
        if (!normalizedMac) {
          throw new Error(`Invalid MAC address in HUAWEI_ROUTER_DEVICE_NAMES: ${mac}`);
        }
        this.deviceNames.set(normalizedMac, name.trim());
      }
    }
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

  private async getLanEndpoint(path: string): Promise<string> {
    if (!this.sessionCookie || !this.csrfToken) {
      throw new Error("Router session is not available");
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Cookie: this.sessionCookie,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Referer: `${this.baseUrl}/CustomApp/mainpage.asp`,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: new URLSearchParams({ "x.X_HW_Token": this.csrfToken }).toString(),
      signal: AbortSignal.timeout(HTTP_TIMEOUT),
    });
    if (!response.ok) {
      throw new Error(`Failed to get LAN data from ${path}: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }

  private parseLanDevices(jsCode: string): RawLanDevice[] {
    return this.parseConstructorCalls(jsCode, "USERDevice")
      .map((call) => this.parseConstructorArgs(call))
      .filter((args) => args.length >= 16)
      .map((args) => ({
        domain: this.cleanString(args[0]),
        ipAddress: this.cleanString(args[1]),
        macAddress: this.cleanString(args[2]),
        port: this.cleanString(args[3]),
        ipType: this.cleanString(args[4]),
        devType: this.cleanString(args[5]),
        devStatus: this.cleanString(args[6]),
        portType: this.cleanString(args[7]),
        hostName: this.cleanString(args[9]),
        ipv4Enabled: this.cleanString(args[10]),
        ipv6Enabled: this.cleanString(args[11]),
        deviceType: this.cleanString(args[12]),
        userDevAlias: this.cleanString(args[13]),
        userSpecifiedDeviceType: this.cleanString(args[14]),
        leaseTimeRemaining: this.cleanString(args[15]),
      }));
  }

  private parseDhcpLeases(jsCode: string): RawDhcpLease[] {
    return this.parseConstructorCalls(jsCode, "DHCPInfo")
      .map((call) => this.parseConstructorArgs(call))
      .filter((args) => args.length >= 8)
      .map((args) => ({
        domain: this.cleanString(args[0]),
        name: this.cleanString(args[1]),
        ipAddress: this.cleanString(args[2]),
        macAddress: this.cleanString(args[3]),
        remainingTime: this.cleanString(args[4]),
        deviceType: this.cleanString(args[5]),
        interfaceType: this.cleanString(args[6]),
        addressSource: this.cleanString(args[7]),
      }));
  }

  private normalizeMac(macAddress: string): string | undefined {
    const normalized = macAddress.replace(/[:-]/g, "").toUpperCase();
    return /^[0-9A-F]{12}$/.test(normalized) ? normalized : undefined;
  }

  private getManufacturer(macAddress: string): string | undefined {
    const mac = this.normalizeMac(macAddress);
    if (!mac) return undefined;
    const firstOctet = Number.parseInt(mac.slice(0, 2), 16);
    // Multicast and locally administered addresses cannot reliably identify a vendor.
    if ((firstOctet & 0x03) !== 0) return undefined;
    const registry = ouiData as Record<string, string>;
    return registry[mac.slice(0, 9)] ??
      registry[mac.slice(0, 7)] ??
      registry[mac.slice(0, 6)];
  }

  private buildLanDevices(devices: RawLanDevice[], leases: RawDhcpLease[]): LanDevice[] {
    const normalize = (value: string) => value.trim().toLowerCase();

    // The router can return the same inventory entry more than once, with
    // partially populated fields in each copy. Collapse those entries before
    // joining DHCP data so one physical device produces one telemetry event.
    const uniqueDevices = new Map<string, RawLanDevice>();
    for (const device of devices) {
      const key =
        this.normalizeMac(device.macAddress) ??
        (device.ipAddress ? normalize(device.ipAddress) : undefined) ??
        normalize(device.domain);
      const existing = uniqueDevices.get(key);
      if (!existing) {
        uniqueDevices.set(key, { ...device });
        continue;
      }

      for (const field of Object.keys(device) as (keyof RawLanDevice)[]) {
        const incoming = device[field];
        const current = existing[field];
        if (incoming && (!current || (current === "0" && incoming !== "0"))) {
          existing[field] = incoming;
        }
      }
    }
    devices = [...uniqueDevices.values()];
    const byMac = new Map(
      leases
        .filter((lease) => lease.macAddress)
        .map((lease): [string, RawDhcpLease] => [normalize(lease.macAddress), lease])
    );
    const byIp = new Map(
      leases
        .filter((lease) => lease.ipAddress)
        .map((lease): [string, RawDhcpLease] => [normalize(lease.ipAddress), lease])
    );
    const consumed = new Set<RawDhcpLease>();
    const result: LanDevice[] = [];

    for (const device of devices) {
      if (device.devStatus.toLowerCase() !== "online") continue;
      const lease =
        (device.macAddress ? byMac.get(normalize(device.macAddress)) : undefined) ??
        (device.ipAddress ? byIp.get(normalize(device.ipAddress)) : undefined);
      if (lease) consumed.add(lease);
      const normalizedMac = this.normalizeMac(device.macAddress);
      const name =
        (normalizedMac ? this.deviceNames.get(normalizedMac) : undefined) ||
        device.hostName ||
        lease?.name ||
        device.ipAddress ||
        device.macAddress ||
        device.domain;
      if (!name) continue;
      const leaseTime = lease?.remainingTime || device.leaseTimeRemaining;
      const numericLeaseTime = leaseTime && /^[0-9]+$/.test(leaseTime) ? Number(leaseTime) : undefined;
      result.push({
        type: "lan_device",
        name,
        ...(device.ipAddress ? { ip_address: device.ipAddress } : {}),
        ...(device.macAddress ? { mac_address: device.macAddress } : {}),
        ...(device.hostName ? { hostname: device.hostName } : {}),
        ...(device.macAddress && this.getManufacturer(device.macAddress)
          ? { manufacturer: this.getManufacturer(device.macAddress) }
          : {}),
        ...(device.devStatus ? { status: device.devStatus } : {}),
        ...(device.port ? { port: device.port } : {}),
        ...(device.ipType ? { ip_type: device.ipType } : {}),
        ...(device.devType ? { dev_type: device.devType } : {}),
        ...(device.portType ? { port_type: device.portType } : {}),
        ...(device.deviceType && device.deviceType !== "0" ? { device_type: device.deviceType } : {}),
        ...(device.userDevAlias ? { user_device_alias: device.userDevAlias } : {}),
        ...(device.userSpecifiedDeviceType ? { user_specified_device_type: device.userSpecifiedDeviceType } : {}),
        ...(device.ipv4Enabled ? { ipv4_enabled: device.ipv4Enabled } : {}),
        ...(device.ipv6Enabled ? { ipv6_enabled: device.ipv6Enabled } : {}),
        ...(leaseTime && (numericLeaseTime !== undefined ? numericLeaseTime > 0 : true)
          ? { lease_time_remaining: numericLeaseTime ?? leaseTime }
          : {}),
        ...(lease?.addressSource ? { dhcp_address_source: lease.addressSource } : {}),
        ...(lease?.interfaceType ? { dhcp_interface_type: lease.interfaceType } : {}),
        ...(lease?.deviceType ? { dhcp_device_type: lease.deviceType } : {}),
      });
    }

    for (const lease of leases) {
      if (consumed.has(lease)) continue;
      const numericRemainingTime = /^\d+$/.test(lease.remainingTime)
        ? Number(lease.remainingTime)
        : undefined;
      if (numericRemainingTime === 0) continue;
      const normalizedMac = this.normalizeMac(lease.macAddress);
      const name =
        (normalizedMac ? this.deviceNames.get(normalizedMac) : undefined) ||
        lease.name ||
        lease.ipAddress ||
        lease.macAddress ||
        lease.domain;
      if (!name) continue;
      const numericLeaseTime = lease.remainingTime && /^[0-9]+$/.test(lease.remainingTime) ? Number(lease.remainingTime) : undefined;
      result.push({
        type: "lan_device",
        name,
        ...(lease.ipAddress ? { ip_address: lease.ipAddress } : {}),
        ...(lease.macAddress ? { mac_address: lease.macAddress } : {}),
        ...(lease.name ? { hostname: lease.name } : {}),
        ...(lease.macAddress && this.getManufacturer(lease.macAddress)
          ? { manufacturer: this.getManufacturer(lease.macAddress) }
          : {}),
        ...(lease.remainingTime && (numericLeaseTime !== undefined ? numericLeaseTime > 0 : true)
          ? { lease_time_remaining: numericLeaseTime ?? lease.remainingTime }
          : {}),
        ...(lease.addressSource ? { dhcp_address_source: lease.addressSource } : {}),
        ...(lease.interfaceType ? { dhcp_interface_type: lease.interfaceType } : {}),
        ...(lease.deviceType ? { dhcp_device_type: lease.deviceType } : {}),
      });
    }
    return result;
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
   * Parses the optical receive level and normalizes the GPON state exposed
   * by the router.
   */
  private parseOpticalInfo(jsCode: string): OpticalInfo {
    const opticInfo = this.readStringVariable(jsCode, "opticInfo");
    const ponMode = this.readStringVariable(jsCode, "ontPonMode");
    const gponStatus = this.readStringVariable(jsCode, "gponStatus");

    const rxPower =
      opticInfo && opticInfo !== "--" ? Number(opticInfo) : Number.NaN;
    const mode = ponMode?.toLowerCase();
    const gponStates = {
      O1: "initializing",
      O2: "standby",
      O3: "discovering",
      O4: "ranging",
      O5: "operational",
      O6: "recovering",
      O7: "emergency_stop",
    } as const;
    const ponStatus =
      mode === "gpon" && gponStatus
        ? gponStates[gponStatus.toUpperCase() as keyof typeof gponStates] ?? "unknown"
        : undefined;

    return {
      ...(Number.isFinite(rxPower) ? { optical_rx_power_dbm: rxPower } : {}),
      ...(mode === "gpon" || mode === "epon" ? { pon_mode: mode } : {}),
      ...(mode === "gpon" && gponStatus ? { pon_status: ponStatus ?? "unknown" } : {}),
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

    const [deviceResponse, leaseResponse] = await Promise.allSettled([
      this.getLanEndpoint("/html/bbsp/common/GetLanUserDevInfo.asp"),
      this.getLanEndpoint("/html/bbsp/common/GetLanUserDhcpInfo.asp"),
    ]);
    const rawDevices =
      deviceResponse.status === "fulfilled"
        ? this.parseLanDevices(deviceResponse.value)
        : [];
    const rawLeases =
      leaseResponse.status === "fulfilled"
        ? this.parseDhcpLeases(leaseResponse.value)
        : [];

    if (deviceResponse.status === "rejected") {
      this.logger.debug("Failed to collect LAN device inventory", {
        error:
          deviceResponse.reason instanceof Error
            ? deviceResponse.reason.message
            : String(deviceResponse.reason),
      });
    }
    if (leaseResponse.status === "rejected") {
      this.logger.debug("Failed to collect DHCP lease information", {
        error:
          leaseResponse.reason instanceof Error
            ? leaseResponse.reason.message
            : String(leaseResponse.reason),
      });
    }

    const wanConnection = {
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
    return [wanConnection, ...this.buildLanDevices(rawDevices, rawLeases)];
  }
}
