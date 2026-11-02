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
 * Plugins selected by `--plugin` (include, `all` by default), minus those
 * excluded by `--no-plugin`
 */
export function getSelectedPlugins(
  included: string[] = args.values.plugin,
  excluded: string[] = args.values["no-plugin"],
  plugins: PluginConstructor[] = availablePlugins
): PluginConstructor[] {
  const includeAll = included.length === 0 || included.includes("all");

  return plugins.filter(
    (Plugin) =>
      (includeAll || included.includes(Plugin.slug)) &&
      !excluded.includes(Plugin.slug)
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
