import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { plugins } from "./index.mts";

describe("plugins", () => {
  test("every plugin sets its own slug", () => {
    for (const Plugin of plugins) {
      assert.ok(
        Object.hasOwn(Plugin, "slug"),
        `${Plugin.name} must set static readonly slug`
      );
    }
  });

  test("slugs are kebab-case and unique", () => {
    const slugs = plugins.map((Plugin) => Plugin.slug);

    for (const slug of slugs) {
      assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
    assert.equal(new Set(slugs).size, slugs.length);
  });

  test("slugs don't change", () => {
    // Slugs are used by --plugin, as the Datadog plugin tag and as store keys.
    assert.deepEqual(
      plugins.map((Plugin) => Plugin.slug),
      [
        "balay-dishwasher",
        "dht22",
        "fast-speed-test",
        "home-monitor",
        "huawei-router",
        "philips-hue",
        "philips-tv",
        "plex-media-server",
        "resideo",
        "thermobeacon",
        "transmission",
      ]
    );
  });
});
