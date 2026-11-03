import { afterEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";

process.env.HW_API_KEY = "api-key";
process.env.HW_API_SECRET = "api-secret";
process.env.HW_DEVICE_ID = "device-id";
process.env.HW_LOCATION_ID = "location-id";
process.env.HW_USER_REF_ID = "user-ref-id";

const { Resideo } = await import("./resideo.mts");

type Token = { access_token: string; expires_at: number };

type StoreLike = {
  get(): Token | undefined;
  set(value: Token): void;
  clear(): void;
};

const DEVICE = {
  name: "Living room",
  changeableValues: { mode: "Heat", heatSetpoint: 21, coolSetpoint: 25 },
  operationStatus: { mode: "Heat" },
  indoorTemperature: 20.5,
  indoorHumidity: 45,
  outdoorTemperature: 8,
  displayedOutdoorHumidity: 80,
};

function tokenResponse(accessToken: string, expiresIn: string | number) {
  return Response.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresIn,
  });
}

/**
 * Creates a plugin whose store lives in memory instead of on disk
 */
function createPlugin(initialToken?: Token) {
  const plugin = new Resideo();
  const store = (plugin as unknown as { store: StoreLike }).store;
  let value = initialToken;

  mock.method(store, "get", () => value);
  mock.method(store, "set", (token: Token) => {
    value = token;
  });
  mock.method(store, "clear", () => {
    value = undefined;
  });

  return { plugin, getStoredToken: () => value };
}

function mockResideo(...responses: Response[]) {
  return mock.method(
    globalThis,
    "fetch",
    async () => responses.shift() ?? new Response(null, { status: 500 })
  );
}

function requests(fetchMock: ReturnType<typeof mockResideo>) {
  return fetchMock.mock.calls.map((call) => {
    const [url, init] = call.arguments as unknown as [string, RequestInit];
    const headers = (init.headers ?? {}) as Record<string, string>;

    return { path: new URL(url).pathname, authorization: headers.Authorization };
  });
}

describe("Resideo", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  test("run reuses the cached access token until it is about to expire", async () => {
    const now = 1_000_000;
    mock.method(Date, "now", () => now);

    const { plugin, getStoredToken } = createPlugin();
    const fetchMock = mockResideo(
      tokenResponse("token-1", "1799"),
      Response.json(DEVICE),
      Response.json(DEVICE)
    );

    await plugin.run();
    await plugin.run();

    assert.deepEqual(getStoredToken(), {
      access_token: "token-1",
      expires_at: now + 1799 * 1000,
    });
    assert.deepEqual(requests(fetchMock), [
      { path: "/oauth2/accesstoken", authorization: "Basic YXBpLWtleTphcGktc2VjcmV0" },
      { path: "/v2/devices/thermostats/device-id", authorization: "Bearer token-1" },
      { path: "/v2/devices/thermostats/device-id", authorization: "Bearer token-1" },
    ]);
  });

  test("run requests a new access token when the cached one is about to expire", async () => {
    const now = 1_000_000;
    mock.method(Date, "now", () => now);

    const { plugin, getStoredToken } = createPlugin({
      access_token: "token-1",
      expires_at: now + 30_000,
    });
    const fetchMock = mockResideo(
      tokenResponse("token-2", 1799),
      Response.json(DEVICE)
    );

    await plugin.run();

    assert.equal(getStoredToken()?.access_token, "token-2");
    assert.deepEqual(
      requests(fetchMock).map(({ authorization }) => authorization),
      ["Basic YXBpLWtleTphcGktc2VjcmV0", "Bearer token-2"]
    );
  });

  test("run ignores a malformed cached access token", async () => {
    const { plugin, getStoredToken } = createPlugin({
      access_token: "token-1",
      expires_at: "never",
    } as unknown as Token);
    mockResideo(tokenResponse("token-2", 1799), Response.json(DEVICE));

    await plugin.run();

    assert.equal(getStoredToken()?.access_token, "token-2");
  });

  test("run clears the cached access token when it is rejected", async () => {
    const { plugin, getStoredToken } = createPlugin({
      access_token: "revoked",
      expires_at: Date.now() + 3_600_000,
    });
    mockResideo(new Response(null, { status: 401 }));

    await assert.rejects(plugin.run(), /status: 401/);
    assert.equal(getStoredToken(), undefined);
  });

  test("run does not cache an access token without a valid expiry", async () => {
    const { plugin, getStoredToken } = createPlugin();
    mockResideo(tokenResponse("token-1", "soon"), Response.json(DEVICE));

    await plugin.run();

    assert.equal(getStoredToken(), undefined);
  });
});
