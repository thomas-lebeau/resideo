#!/usr/bin/env node

import "./polyfills.js";

import datadog from "./utils/Datadog.mts";
import { Logger } from "./utils/Loggers.mts";
import { parseArgs } from "node:util";
import { plugins as availablePlugins } from "./plugins/index.mts";
import { toKebabCase } from "./shared/string.mts";

const logger = new Logger("Main");

async function main(): Promise<void> {
  try {
    const args = parseArgs({
      args: process.argv.slice(2),
      options: {
        plugin: {
          type: "string",
          short: "p",
          long: "plugin",
          multiple: true,
        },
      },
    });

    const selectedPlugins = args.values.plugin
      ? args.values.plugin
          .map((selectedPlugin) =>
            availablePlugins.find(
              (plugin) => toKebabCase(plugin.name) === selectedPlugin
            )
          )
          .filter((plugin) => plugin !== undefined)
      : availablePlugins;

    if (selectedPlugins.length === 0) {
      logger.error(new Error("No plugins found"));
      return;
    }

    for (const Plugin of selectedPlugins) {
      const name = toKebabCase(Plugin.name);
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
  } catch (error) {
    logger.error(new Error("Unknown error", { cause: error }));
  } finally {
    await datadog.flush();
  }
}

main();
