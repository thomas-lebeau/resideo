import { afterEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";

process.env.HUAWEI_ROUTER_HOST = "192.168.0.1";
process.env.HUAWEI_ROUTER_USERNAME = "admin";
process.env.HUAWEI_ROUTER_PASSWORD = "secret";

const { HuaweiRouter } = await import("./huawei-router.mts");

type Internals = {
  parseConstructorArgs(args: string): string[];
  cleanString(value: string): string;
};

// Positional WanIP constructor arguments (see docs/ROUTER_API_ANALYSIS.md)
const WAN_IP = {
  DOMAIN: 0,
  STATUS: 4,
  LAST_CONN_ERR: 5,
  NAME: 7,
  IP_ADDRESS: 14,
  GATEWAY: 16,
  DNS: 19,
  SERVICE_LIST: 25,
} as const;

/**
 * The router hex-escapes punctuation in every string, e.g. "5\x2e154\x2e8\x2e114".
 */
function escape(value: string) {
  return value.replace(
    /[._,:]/g,
    (char) => `\\x${char.charCodeAt(0).toString(16)}`
  );
}

function wanIp(fields: Partial<Record<number, string>>) {
  const args = Array.from({ length: 57 }, (_, i) => `"${escape(fields[i] ?? "")}"`);
  return `new WanIP(${args.join(",")})`;
}

function wanStats(domain: string, bytesSent: string, bytesReceived: string) {
  return `new WaninfoStats("${escape(domain)}","${bytesSent}","${bytesReceived}","0","0","0","0","0","0","0","0")`;
}

const VOIP = wanIp({
  [WAN_IP.DOMAIN]: "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.3.WANIPConnection.1",
  [WAN_IP.STATUS]: "Connecting",
  [WAN_IP.LAST_CONN_ERR]: "ERROR_NO_CARRIER",
  [WAN_IP.NAME]: "3_VOIP_R_VID_30",
  [WAN_IP.IP_ADDRESS]: "0.0.0.0",
  [WAN_IP.SERVICE_LIST]: "VOIP",
});

const INTERNET_UP = wanIp({
  [WAN_IP.DOMAIN]: "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANIPConnection.1",
  [WAN_IP.STATUS]: "Connected",
  [WAN_IP.LAST_CONN_ERR]: "ERROR_NONE",
  [WAN_IP.NAME]: "2_INTERNET_R_VID_10",
  [WAN_IP.IP_ADDRESS]: "5.154.8.114",
  [WAN_IP.GATEWAY]: "5.154.8.1",
  [WAN_IP.DNS]: "78.136.107.50,84.232.73.171",
  [WAN_IP.SERVICE_LIST]: "INTERNET",
});

const INTERNET_DOWN = wanIp({
  [WAN_IP.DOMAIN]: "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANIPConnection.1",
  [WAN_IP.STATUS]: "Connecting",
  [WAN_IP.LAST_CONN_ERR]: "ERROR_NO_CARRIER",
  [WAN_IP.NAME]: "2_INTERNET_R_VID_10",
  [WAN_IP.IP_ADDRESS]: "0.0.0.0",
  [WAN_IP.SERVICE_LIST]: "INTERNET",
});

function wanListPage(wanIps: string[], stats: string[] = []) {
  return `<script language="JavaScript" type="text/javascript">
var IPWanList = new Array(${[...wanIps, "null"].join(",\n")});
var PPPWanList = new Array(null);
var WanEthIPStats = new Array(${[...stats, "null"].join(",\n")});
</script>`;
}

function mockRouter(...wanListResponses: Response[]) {
  return mock.method(globalThis, "fetch", async (input: string) => {
    const { pathname } = new URL(input);

    switch (pathname) {
      case "/asp/GetRandCount.asp":
        return new Response("csrf-token\n");
      case "/login.cgi":
        return new Response(null, {
          status: 302,
          headers: { "set-cookie": "Cookie=session-id; path=/" },
        });
      case "/html/bbsp/common/wan_list.asp":
        return wanListResponses.shift() ?? new Response(null, { status: 500 });
      default:
        throw new Error(`Unexpected request to ${pathname}`);
    }
  });
}

describe("HuaweiRouter", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  test("parseConstructorArgs splits on top level commas only", () => {
    const plugin = new HuaweiRouter() as unknown as Internals;

    assert.deepEqual(
      plugin.parseConstructorArgs(`"a,b", 'c', fn(1, 2), "say \\"hi\\"", 3`),
      [`"a,b"`, `'c'`, `fn(1, 2)`, `"say \\"hi\\""`, `3`]
    );
  });

  test("cleanString strips quotes and decodes hex escapes", () => {
    const plugin = new HuaweiRouter() as unknown as Internals;

    assert.equal(plugin.cleanString(`"5\\x2e154\\x2e8\\x2e114"`), "5.154.8.114");
    assert.equal(plugin.cleanString(`'2\\x5fINTERNET'`), "2_INTERNET");
    assert.equal(plugin.cleanString(`"a\\x2cb\\x3ac"`), "a,b:c");
  });

  test("run reports the internet connection with traffic stats", async () => {
    const fetchMock = mockRouter(
      new Response(
        wanListPage(
          [VOIP, INTERNET_UP],
          [
            wanStats("voip", "1", "2"),
            wanStats("internet", "791484635", "1823521274"),
          ]
        )
      )
    );

    const data = await new HuaweiRouter().run();

    assert.deepEqual(
      { ...data, uptime: undefined },
      {
        type: "wan_connection",
        name: "2_INTERNET_R_VID_10",
        state: 1,
        ip_address: "5.154.8.114",
        gateway: "5.154.8.1",
        dns_servers: ["78.136.107.50", "84.232.73.171"],
        uptime: undefined,
        bytes_received: 1823521274,
        bytes_sent: 791484635,
      }
    );

    // Logs in, then sends the session cookie
    const [, login, wanList] = fetchMock.mock.calls.map(
      (call) => call.arguments as unknown as [string, RequestInit]
    );
    assert.equal(
      login[1].body,
      "UserName=admin&PassWord=c2VjcmV0&Language=english&x.X_HW_Token=csrf-token"
    );
    assert.deepEqual(wanList[1].headers, {
      Cookie: "Cookie=session-id",
      Referer: "http://192.168.0.1/CustomApp/mainpage.asp",
    });
  });

  test("run reports a down internet connection", async () => {
    mockRouter(new Response(wanListPage([INTERNET_DOWN])));

    const data = await new HuaweiRouter().run();

    assert.equal(data?.state, 0);
    assert.equal(data?.ip_address, "0.0.0.0");
    assert.deepEqual(data?.dns_servers, []);
  });

  test("run returns undefined without an internet connection", async () => {
    mockRouter(new Response(wanListPage([VOIP])));

    assert.equal(await new HuaweiRouter().run(), undefined);
  });

  test("run logs in again when the session expired", async () => {
    const fetchMock = mockRouter(
      new Response(null, { status: 403 }),
      new Response(wanListPage([INTERNET_UP]))
    );

    const data = await new HuaweiRouter().run();

    assert.equal(data?.state, 1);
    assert.equal(
      fetchMock.mock.calls.filter((call) =>
        String(call.arguments[0]).endsWith("/login.cgi")
      ).length,
      2
    );
  });
});
