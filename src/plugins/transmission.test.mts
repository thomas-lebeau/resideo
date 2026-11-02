import { afterEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";

process.env.TRANSMISSION_HOST = "localhost:9091";
process.env.TRANSMISSION_USERNAME = "admin";
process.env.TRANSMISSION_PASSWORD = "secret";

const { Transmission } = await import("./transmission.mts");

const SESSION_STATS = {
  activeTorrentCount: 1,
  downloadSpeed: 2,
  pausedTorrentCount: 3,
  torrentCount: 4,
  uploadSpeed: 5,
  "cumulative-stats": {
    uploadedBytes: 6,
    downloadedBytes: 7,
    filesAdded: 8,
    sessionCount: 9,
    secondsActive: 10,
  },
};

function conflict(sessionId: string) {
  return new Response(null, {
    status: 409,
    headers: { "X-Transmission-Session-Id": sessionId },
  });
}

function mockTransmission(...responses: Response[]) {
  return mock.method(
    globalThis,
    "fetch",
    async () => responses.shift() ?? new Response(null, { status: 500 })
  );
}

function sessionIds(fetchMock: ReturnType<typeof mockTransmission>) {
  return fetchMock.mock.calls.map(
    (call) =>
      ((call.arguments as unknown as [string, RequestInit])[1].headers as Record<
        string,
        string | undefined
      >)["X-Transmission-Session-Id"]
  );
}

describe("Transmission", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  test("run reports session stats", async () => {
    mockTransmission(Response.json({ arguments: SESSION_STATS }));

    assert.deepEqual(await new Transmission().run(), {
      type: "transmission",
      name: "Transmission",
      active_torrent_count: 1,
      download_speed: 2,
      paused_torrent_count: 3,
      torrent_count: 4,
      upload_speed: 5,
      total_downloaded: 7,
      total_uploaded: 6,
      total_files_added: 8,
      total_session_count: 9,
      total_seconds_active: 10,
    });
  });

  test("run retries once with the session id from a 409", async () => {
    const fetchMock = mockTransmission(
      conflict("session-1"),
      Response.json({ arguments: SESSION_STATS })
    );

    const data = await new Transmission().run();

    assert.equal(data.torrent_count, 4);
    assert.deepEqual(sessionIds(fetchMock), [undefined, "session-1"]);
  });

  test("run throws instead of retrying forever on repeated 409s", async () => {
    const fetchMock = mockTransmission(
      conflict("session-1"),
      conflict("session-2"),
      conflict("session-3")
    );

    await assert.rejects(new Transmission().run(), /status: 409/);
    assert.equal(fetchMock.mock.callCount(), 2);
  });
});
