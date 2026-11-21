import { afterEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import FastSpeedtest from "fast-speedtest-api";

process.env.FAST_SPEEDTEST_TOKEN = "token";

const { FastSpeedTest } = await import("./fast-speed-test.mts");

describe("FastSpeedTest", () => {
  afterEach(() => mock.restoreAll());

  test("reports the download speed under a fixed name", async () => {
    mock.method(FastSpeedtest.prototype, "getSpeed", async () => 123_456);

    assert.deepEqual(await new FastSpeedTest().run(), {
      type: "speedtest",
      name: "Internet",
      speed: 123_456,
    });
  });
});
