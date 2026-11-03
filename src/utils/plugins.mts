import { plugins as availablePlugins } from "../plugins/index.mts";
import { args } from "./args.mts";
import {
  MissingConfigError,
  type AbstractPlugin,
  type PluginConstructor,
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

export type Plugins = {
  /** Instantiated plugins, reused for run, stop, setup and clear-store */
  instances: AbstractPlugin[];
  /** Plugins whose constructor threw an error other than a missing config */
  pending: PluginConstructor[];
};

/**
 * Instantiate the selected plugins once. Throws when no plugin is selected or
 * when none of them could be instantiated, so the process doesn't keep running
 * with nothing to do.
 */
export function createPlugins(
  selectedPlugins: PluginConstructor[] = getSelectedPlugins()
): Plugins {
  if (selectedPlugins.length === 0) {
    throw new Error(
      "No plugins found, run with --list-plugins to see available plugins"
    );
  }

  const plugins: Plugins = { instances: [], pending: selectedPlugins };

  instantiatePending(plugins);

  if (plugins.instances.length === 0) {
    throw new Error("No plugin could be started, see the errors above");
  }

  return plugins;
}

/**
 * Try to instantiate the pending plugins, reporting every constructor error.
 * A missing config is not retried, because the environment doesn't change
 * while the process runs. Any other error is retried on the next call.
 */
export function instantiatePending(plugins: Plugins): void {
  plugins.pending = plugins.pending.filter((Plugin) => {
    try {
      plugins.instances.push(new Plugin());

      return false;
    } catch (error) {
      Plugin.logger.error(error as Error);

      return !(error instanceof MissingConfigError);
    }
  });
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
