import { plugins as availablePlugins } from "../plugins/index.mts";
import { args } from "./args.mts";
import {
  MissingConfigError,
  type AbstractPlugin,
  type PluginConstructor,
} from "../shared/AbstractPlugin.mts";

/**
 * Plugins whose configuration is missing. They are reported once, then skipped.
 */
const unconfiguredPlugins = new Set<PluginConstructor>();

/**
 * Plugins whose last run hasn't finished yet.
 */
const runningPlugins = new Set<PluginConstructor>();

/**
 * Calls `callback` unless the previous call for the same plugin is still in
 * flight, in which case it is skipped with a warning. Ticks fire every minute
 * regardless, so this keeps a slow plugin (hung host, speed test...) from
 * piling up concurrent runs, e.g. overlapping BLE scans.
 */
export async function runExclusively(
  plugin: AbstractPlugin,
  callback: () => Promise<void>
): Promise<void> {
  const Plugin = plugin.constructor as PluginConstructor;

  if (runningPlugins.has(Plugin)) {
    plugin.logger.warn(
      `⏳ Previous run of ${Plugin.slug} is still in progress, skipping`
    );
    return;
  }

  runningPlugins.add(Plugin);

  try {
    await callback();
  } finally {
    runningPlugins.delete(Plugin);
  }
}

export function getSelectedPlugins() {
  if (args.values["no-plugin"].length > 0) {
    return availablePlugins.filter(
      (Plugin) => !args.values["no-plugin"].includes(Plugin.slug)
    );
  }

  if (args.values.plugin.length === 0 || args.values.plugin.includes("all")) {
    return availablePlugins;
  }

  return availablePlugins.filter((Plugin) =>
    args.values.plugin.includes(Plugin.slug)
  );
}

/**
 * Slugs passed to `--plugin` / `--no-plugin` that match no available plugin
 */
export function getUnknownPluginSlugs(
  slugs: string[] = [...args.values.plugin, ...args.values["no-plugin"]],
  plugins: PluginConstructor[] = availablePlugins
): string[] {
  const known = new Set(plugins.map((Plugin) => Plugin.slug));

  return slugs.filter((slug) => slug !== "all" && !known.has(slug));
}

export async function forEachPlugin(
  callback: (plugin: AbstractPlugin) => Promise<void>,
  selectedPlugins: PluginConstructor[] = getSelectedPlugins()
): Promise<void> {
  if (selectedPlugins.length === 0) {
    throw new Error(
      "No plugins found, run with --list-plugins to see available plugins"
    );
  }

  const promises: Promise<void>[] = [];

  for (const Plugin of selectedPlugins) {
    if (unconfiguredPlugins.has(Plugin)) {
      continue;
    }

    promises.push(
      Promise.resolve()
        .then(() => callback(new Plugin()))
        .catch((error) => {
          if (error instanceof MissingConfigError) {
            unconfiguredPlugins.add(Plugin);
          }

          Plugin.logger.error(error);
        })
    );
  }

  await Promise.all(promises);
}
