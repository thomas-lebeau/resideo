import { describe, mock, test } from "node:test";
import assert from "node:assert/strict";

import {
  AbstractPlugin,
  type PluginConstructor,
} from "../shared/AbstractPlugin.mts";
import {
  createPlugins,
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

describe("createPlugins", () => {
  test("reports a missing config once and leaves the plugin out", (t) => {
    const errorSpy = mock.method(console, "error", () => {});
    t.after(() => errorSpy.mock.restore());

    const instances = createPlugins([
      ConfiguredPlugin,
      UnconfiguredPlugin,
    ] as unknown as PluginConstructor[]);

    assert.equal(instances.length, 1);
    assert.ok(instances[0] instanceof ConfiguredPlugin);
    assert.equal(errorSpy.mock.callCount(), 1);
    assert.match(
      String(errorSpy.mock.calls[0]?.arguments[0]),
      /PLUGINS_TEST_MISSING_ENV is not set/
    );
  });

  test("throws when no plugin is selected", () => {
    assert.throws(() => createPlugins([]), /No plugins found/);
  });
});

describe("forEachPlugin", () => {
  test("passes the same instances on every call", async () => {
    const instances = createPlugins([
      ConfiguredPlugin,
    ] as unknown as PluginConstructor[]);
    const seen: AbstractPlugin[] = [];

    for (let i = 0; i < 3; i++) {
      await forEachPlugin(instances, async (plugin) => {
        seen.push(plugin);
      });
    }

    assert.equal(seen.length, 3);
    assert.ok(seen.every((plugin) => plugin === instances[0]));
  });

  test("keeps reporting runtime errors without stopping other plugins", async (t) => {
    const errorSpy = mock.method(console, "error", () => {});
    t.after(() => errorSpy.mock.restore());

    const failing = new ConfiguredPlugin();
    const working = new ConfiguredPlugin();
    const ran: AbstractPlugin[] = [];

    for (let i = 0; i < 2; i++) {
      await forEachPlugin([failing, working], async (plugin) => {
        if (plugin === failing) {
          throw new Error("boom");
        }

        ran.push(plugin);
      });
    }

    assert.equal(errorSpy.mock.callCount(), 2);
    assert.deepEqual(ran, [working, working]);
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
