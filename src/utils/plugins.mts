import type { PluginConstructor } from "../shared/AbstractPlugin.mts";
import datadog from "./Datadog.mts";
import { Logger } from "./Loggers.mts";

export async function runPlugin(Plugin: PluginConstructor) {
  const name = Plugin.slug;
  const logger = new Logger(name);

  try {
    logger.info(`🔄 Running plugin ${name}...`);

    const data = await new Plugin().run();

    if (data) {
      datadog.send(name, data);
    }
  } catch (error) {
    logger.error(error as Error);
  }
}

export function filterPlugins(
  availablePlugins: PluginConstructor[],
  pluginNames: string[] = []
) {
  if (pluginNames.length === 0 || pluginNames.includes("all")) {
    return availablePlugins;
  }

  return pluginNames
    .map((selectedPlugin) =>
      availablePlugins.find((Plugin) => Plugin.slug === selectedPlugin)
    )
    .filter((Plugin) => Plugin !== undefined);
}
