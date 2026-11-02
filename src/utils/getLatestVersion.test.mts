import { afterEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";

import { getLatestVersion } from "./getLatestVersion.mts";

function mockFetch(response: Response) {
  return mock.method(globalThis, "fetch", async () => response);
}

describe("getLatestVersion", () => {
  afterEach(() => mock.restoreAll());

  test("returns the tag of the latest release", async () => {
    const fetch = mockFetch(Response.json({ tag_name: "v3.2.3" }));

    assert.equal(await getLatestVersion(), "v3.2.3");
    assert.equal(
      fetch.mock.calls[0].arguments[0],
      "https://api.github.com/repos/thomas-lebeau/resideo/releases/latest"
    );
  });

  test("throws when GitHub responds with an error (e.g. rate limit)", async () => {
    mockFetch(
      Response.json(
        { message: "API rate limit exceeded" },
        { status: 403, statusText: "Forbidden" }
      )
    );

    await assert.rejects(getLatestVersion(), {
      message: "Could not get the latest release from GitHub: HTTP 403 Forbidden",
    });
  });

  for (const tag_name of [
    undefined,
    null,
    3,
    "",
    "3.2.3",
    "latest",
    "v3.2",
    " v3.2.3",
    "v3.2.3; rm -rf /",
    "v3.2.3$(id)",
  ]) {
    test(`throws on an unexpected tag name: ${JSON.stringify(tag_name)}`, async () => {
      mockFetch(Response.json({ tag_name }));

      await assert.rejects(getLatestVersion(), {
        message: /^Unexpected tag name for the latest release/,
      });
    });
  }
});
