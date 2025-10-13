import type { PluginConstructor } from "../shared/AbstractPlugin.mts";
import datadog from "./Datadog.mts";
import { Logger } from "./Loggers.mts";
import { plugins as availablePlugins } from "../plugins/index.mts";
import { args } from "./config.mts";

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
