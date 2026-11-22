import { afterEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";

process.env.HUAWEI_ROUTER_HOST = "192.168.0.1";
process.env.HUAWEI_ROUTER_USERNAME = "admin";
process.env.HUAWEI_ROUTER_PASSWORD = "secret";

const { HuaweiRouter } = await import("./huawei-router.mts");

type Internals = {
  parseConstructorArgs(args: string): string[];
  parseConstructorCalls(source: string, constructorName: string): string[];
  cleanString(value: string): string;
  parseOpticalInfo(source: string): Record<string, unknown>;
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
  EX_SERVICE_LIST: 26,
  UPTIME: 42,
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
  const args = Array.from(
    { length: 56 },
    (_, i) => `"${escape(fields[i] ?? "")}"`
  );
  return `new WanIP(${args.join(",")})`;
}

function wanStats(domain: string, bytesSent: string, bytesReceived: string) {
  return `new WaninfoStats("${escape(domain)}","${bytesSent}","${bytesReceived}",` +
    `"0","0","0","0","0","0","0","0")`;
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
  [WAN_IP.SERVICE_LIST]: "TR069",
  [WAN_IP.EX_SERVICE_LIST]: "INTERNET",
  [WAN_IP.UPTIME]: "12345",
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

const OPTICAL_INFO_PAGE = `var opticInfo = '-20.09';
var ontPonMode = 'gpon';
var gponStatus = 'O5';
var eponStatus = '';
function getResult() {
  opticInfo = "ok";
  return { opticInfo: opticInfo };
}
getResult();`;

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
      case "/html/amp/common/getSmartDiagnoseResult.asp":
        return new Response(OPTICAL_INFO_PAGE);
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

  test("parseConstructorCalls handles nested parentheses and quoted delimiters", () => {
    const plugin = new HuaweiRouter() as unknown as Internals;

    assert.deepEqual(
      plugin.parseConstructorCalls(
        `new WanIP("a,b", fn(1, 2), "c)"), new WanIP("d")`,
        "WanIP"
      ),
      [`"a,b", fn(1, 2), "c)"`, `"d"`]
    );
  });

  test("cleanString strips quotes and decodes hex escapes", () => {
    const plugin = new HuaweiRouter() as unknown as Internals;

    assert.equal(plugin.cleanString(`"5\\x2e154\\x2e8\\x2e114"`), "5.154.8.114");
    assert.equal(plugin.cleanString(`'2\\x5fINTERNET'`), "2_INTERNET");
    assert.equal(plugin.cleanString(`"a\\x2cb\\x3ac"`), "a,b:c");
  });

  test("parseOpticalInfo reads the original RX power and derives GPON registration", () => {
    const plugin = new HuaweiRouter() as unknown as Internals;

    assert.deepEqual(plugin.parseOpticalInfo(OPTICAL_INFO_PAGE), {
      optical_rx_power_dbm: -20.09,
      pon_mode: "gpon",
      gpon_status: "O5",
      ont_registration_state: "registered",
    });
  });

  test("parseOpticalInfo omits unavailable optical readings", () => {
    const plugin = new HuaweiRouter() as unknown as Internals;

    assert.deepEqual(
      plugin.parseOpticalInfo("var opticInfo = '--'; var ontPonMode = '';"),
      {}
    );
  });

  test("run reports the internet connection with traffic stats", async () => {
    const fetchMock = mockRouter(
      new Response(
        wanListPage(
          [VOIP, INTERNET_UP],
          [
            wanStats(
              "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANIPConnection.1.Stats",
              "791484635",
              "1823521274"
            ),
            wanStats(
              "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.3.WANIPConnection.1.Stats",
              "1",
              "2"
            ),
          ]
        )
      )
    );

    const data = await new HuaweiRouter().run();

    assert.deepEqual(
      data,
      {
        type: "wan_connection",
        name: "2_INTERNET_R_VID_10",
        state: 1,
        ip_address: "5.154.8.114",
        gateway: "5.154.8.1",
        dns_servers: ["78.136.107.50", "84.232.73.171"],
        uptime: 12345,
        bytes_received: 1823521274,
        bytes_sent: 791484635,
        optical_rx_power_dbm: -20.09,
        pon_mode: "gpon",
        gpon_status: "O5",
        ont_registration_state: "registered",
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
    const opticalRequest = fetchMock.mock.calls[3].arguments[1] as RequestInit;
    assert.equal(opticalRequest.method, "POST");
    assert.equal(opticalRequest.body, "x.X_HW_Token=csrf-token");
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

  test("run logs in again when the router answers with the login page", async () => {
    const fetchMock = mockRouter(
      new Response("<html><title>Login</title></html>"),
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

  test("run throws instead of logging in forever when still unauthorized", async () => {
    const fetchMock = mockRouter(
      new Response(null, { status: 403 }),
      new Response(null, { status: 403 }),
      new Response(null, { status: 403 })
    );

    await assert.rejects(new HuaweiRouter().run(), /after logging in again: 403/);
    assert.equal(
      fetchMock.mock.calls.filter((call) =>
        String(call.arguments[0]).endsWith("/wan_list.asp")
      ).length,
      2
    );
  });

  test("run throws when the login page keeps coming back", async () => {
    mockRouter(
      new Response("<html><title>Login</title></html>"),
      new Response("<html><title>Login</title></html>")
    );

    await assert.rejects(new HuaweiRouter().run(), /no IPWanList/);
  });
});
