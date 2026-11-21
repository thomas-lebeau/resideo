import { afterEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";

process.env.PLEX_HOST = "plex.local:32400";
process.env.PLEX_TOKEN = "plex-token";

const { PlexMediaServer } = await import("./plex-media-server.mts");

const SECTIONS = [
  { key: 1, title: "Movies", type: "movie" },
  { key: 2, title: "TV Shows", type: "show" },
  { key: 3, title: "Music", type: "artist" },
  { key: 4, title: "Photos", type: "photo" },
];

// totalSize returned by /library/sections/:key/all, by section key and `type` param
const TOTAL_SIZES: Record<string, number> = {
  "1": 10,
  "2": 20,
  "2:4": 200,
  "3": 30,
  "3:9": 300,
  "3:10": 3000,
  "4": 40,
};

function mockPlex({
  sections = SECTIONS,
  sessions,
}: {
  sections?: unknown[];
  sessions?: unknown[];
} = {}) {
  return mock.method(globalThis, "fetch", async (input: string) => {
    const url = new URL(input);
    let container: unknown;

    if (url.pathname === "/identity") {
      container = { version: "1.2.3" };
    } else if (url.pathname === "/library/sections") {
      container = { size: sections.length, Directory: sections };
    } else if (url.pathname === "/status/sessions") {
      container = sessions
        ? { size: sessions.length, Metadata: sessions }
        : { size: 0 };
    } else {
      const key = url.pathname.match(/^\/library\/sections\/(\d+)\/all$/)?.[1];
      const type = url.searchParams.get("type");
      const totalSize = TOTAL_SIZES[type ? `${key}:${type}` : `${key}`];

      if (totalSize === undefined) {
        return new Response(null, { status: 404 });
      }

      container = { totalSize };
    }

    return Response.json({ MediaContainer: container });
  });
}

function session(decisions?: { videoDecision: string; audioDecision: string }) {
  return {
    title: "Some title",
    type: "movie",
    Player: { state: "playing", machineIdentifier: "id", platform: "web" },
    User: { id: "1", title: "user" },
    ...(decisions ? { TranscodeSession: decisions } : {}),
  };
}

describe("PlexMediaServer", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  test("run reports each library with the counts that fit its type", async () => {
    mockPlex();

    const data = await new PlexMediaServer().run();

    assert.deepEqual(data.slice(0, -1), [
      {
        plexVersion: "1.2.3",
        name: "Movies",
        count: 10,
        type: "movie-library",
      },
      {
        plexVersion: "1.2.3",
        name: "TV Shows",
        count: 20,
        type: "show-library",
        episodeCount: 200,
      },
      {
        plexVersion: "1.2.3",
        name: "Music",
        count: 30,
        type: "music-library",
        albumCount: 300,
        trackCount: 3000,
      },
      {
        plexVersion: "1.2.3",
        name: "Photos",
        count: 40,
        type: "photo-library",
      },
    ]);
  });

  test("run skips libraries of an unknown type", async () => {
    mockPlex({
      sections: [
        ...SECTIONS.slice(0, 1),
        { key: 5, title: "Other", type: "x" },
      ],
    });

    const data = await new PlexMediaServer().run();

    assert.deepEqual(
      data.map(({ name }) => name),
      ["Movies", "Plex Media Server"]
    );
  });

  test("run reports no active streams when nothing is playing", async () => {
    mockPlex({ sections: [] });

    assert.deepEqual(await new PlexMediaServer().run(), [
      {
        type: "plex-sessions",
        name: "Plex Media Server",
        plexVersion: "1.2.3",
        active_streams: 0,
        transcode_count: 0,
      },
    ]);
  });

  test("run counts active streams and the ones being transcoded", async () => {
    mockPlex({
      sections: [],
      sessions: [
        session(),
        session({ videoDecision: "copy", audioDecision: "copy" }),
        session({ videoDecision: "transcode", audioDecision: "copy" }),
        session({ videoDecision: "copy", audioDecision: "transcode" }),
      ],
    });

    assert.deepEqual(await new PlexMediaServer().run(), [
      {
        type: "plex-sessions",
        name: "Plex Media Server",
        plexVersion: "1.2.3",
        active_streams: 4,
        transcode_count: 2,
      },
    ]);
  });
});
