import { plugins as availablePlugins } from "../plugins/index.mts";
import { args } from "./args.mts";
import type {
  AbstractPlugin,
  PluginConstructor,
} from "../shared/AbstractPlugin.mts";

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

/**
 * Instantiate the selected plugins once. A plugin whose constructor throws
 * (e.g. missing configuration) is reported and left out.
 */
export function createPlugins(
  selectedPlugins: PluginConstructor[] = getSelectedPlugins()
): AbstractPlugin[] {
  if (selectedPlugins.length === 0) {
    throw new Error(
      "No plugins found, run with --list-plugins to see available plugins"
    );
  }

  const instances: AbstractPlugin[] = [];

  for (const Plugin of selectedPlugins) {
    try {
      instances.push(new Plugin());
    } catch (error) {
      Plugin.logger.error(error as Error);
    }
  }

  return instances;
}

/**
 * Run `callback` on every plugin instance concurrently. Errors are reported
 * per plugin and don't stop the other plugins.
 */
export async function forEachPlugin(
  plugins: AbstractPlugin[],
  callback: (plugin: AbstractPlugin) => Promise<void>
): Promise<void> {
  await Promise.all(
    plugins.map((plugin) =>
      Promise.resolve()
        .then(() => callback(plugin))
        .catch((error) => plugin.logger.error(error))
    )
  );
}
