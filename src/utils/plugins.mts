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

export async function forEachPlugin(
  callback: (plugin: AbstractPlugin) => Promise<void>,
  selectedPlugins: PluginConstructor[] = getSelectedPlugins()
): Promise<void> {
  if (selectedPlugins.length === 0) {
    throw new Error("No plugins found");
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
