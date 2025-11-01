import datadog from "./Datadog.mts";
import { plugins as availablePlugins } from "../plugins/index.mts";
import { args } from "./config.mts";
import type { PluginConstructor } from "../shared/AbstractPlugin.mts";

export async function runPlugin(Plugin: PluginConstructor) {
  try {
    Plugin.logger.info(`🔄 Running plugin ${Plugin.slug}...`);

    if (args.values.setup) {
      await new Plugin().setup();
      return;
    }

    const data = await new Plugin().run();

    if (data) {
      datadog.send(Plugin.slug, data);
    }
  } catch (error) {
    Plugin.logger.error(error as Error);
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
