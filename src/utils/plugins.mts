import { plugins as availablePlugins } from "../plugins/index.mts";
import { args } from "./args.mts";
import type { AbstractPlugin } from "../shared/AbstractPlugin.mts";

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
  callback: (plugin: AbstractPlugin) => Promise<void>
): Promise<void> {
  const selectedPlugins = getSelectedPlugins();

  if (selectedPlugins.length === 0) {
    throw new Error("No plugins found");
  }

  const promises: Promise<void>[] = [];

  for (const Plugin of selectedPlugins) {
    promises.push(
      callback(new Plugin()).catch((error) => Plugin.logger.error(error))
    );
  }

  await Promise.all(promises);
}
