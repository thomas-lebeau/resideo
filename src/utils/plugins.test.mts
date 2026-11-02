import { describe, mock, test } from "node:test";
import assert from "node:assert/strict";

import {
  AbstractPlugin,
  type PluginConstructor,
} from "../shared/AbstractPlugin.mts";
import {
  forEachPlugin,
  getSelectedPlugins,
  getUnknownPluginSlugs,
} from "./plugins.mts";

class ConfiguredPlugin extends AbstractPlugin {
  static readonly description = "Configured plugin";

  constructor() {
    super([]);
  }

  async run() {
    return undefined;
  }
}

class UnconfiguredPlugin extends AbstractPlugin {
  static readonly description = "Unconfigured plugin";

  constructor() {
    super(["PLUGINS_TEST_MISSING_ENV"]);
  }

  async run() {
    return undefined;
  }
}

describe("forEachPlugin", () => {
  test("reports a missing config once, then skips the plugin", async (t) => {
    const errorSpy = mock.method(console, "error", () => {});
    t.after(() => errorSpy.mock.restore());

    const plugins = [
      ConfiguredPlugin,
      UnconfiguredPlugin,
    ] as unknown as PluginConstructor[];
    const ran: string[] = [];

    for (let i = 0; i < 3; i++) {
      await forEachPlugin(async (plugin) => {
        ran.push(plugin.constructor.name);
      }, plugins);
    }

    assert.deepEqual(ran, Array(3).fill("ConfiguredPlugin"));
    assert.equal(errorSpy.mock.callCount(), 1);
    assert.match(
      String(errorSpy.mock.calls[0]?.arguments[0]),
      /PLUGINS_TEST_MISSING_ENV is not set/
    );
  });

  test("keeps reporting runtime errors", async (t) => {
    const errorSpy = mock.method(console, "error", () => {});
    t.after(() => errorSpy.mock.restore());

    const plugins = [ConfiguredPlugin] as unknown as PluginConstructor[];

    for (let i = 0; i < 2; i++) {
      await forEachPlugin(async () => {
        throw new Error("boom");
      }, plugins);
    }

    assert.equal(errorSpy.mock.callCount(), 2);
  });
});

describe("getSelectedPlugins", () => {
  const plugins = [
    ConfiguredPlugin,
    UnconfiguredPlugin,
  ] as unknown as PluginConstructor[];
  const configured = ConfiguredPlugin.slug;
  const unconfigured = UnconfiguredPlugin.slug;

  test("selects all plugins by default", () => {
    assert.deepEqual(getSelectedPlugins(["all"], [], plugins), plugins);
    assert.deepEqual(getSelectedPlugins([], [], plugins), plugins);
  });

  test("selects only the included plugins", () => {
    assert.deepEqual(getSelectedPlugins([configured], [], plugins), [
      ConfiguredPlugin,
    ]);
  });

  test("removes the excluded plugins from all", () => {
    assert.deepEqual(getSelectedPlugins(["all"], [configured], plugins), [
      UnconfiguredPlugin,
    ]);
  });

  test("applies the include filter, then the exclude filter", () => {
    assert.deepEqual(
      getSelectedPlugins([configured, unconfigured], [unconfigured], plugins),
      [ConfiguredPlugin]
    );
    assert.deepEqual(
      getSelectedPlugins([configured], [configured], plugins),
      []
    );
  });
});

describe("getUnknownPluginSlugs", () => {
  test("returns slugs matching no plugin, ignoring all", () => {
    const plugins = [ConfiguredPlugin] as unknown as PluginConstructor[];

    assert.deepEqual(
      getUnknownPluginSlugs(
        ["all", ConfiguredPlugin.slug, "resido", "hue"],
        plugins
      ),
      ["resido", "hue"]
    );
  });
});
