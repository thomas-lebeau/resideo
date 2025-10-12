#!/usr/bin/env node

import "./polyfills.js";

import datadog from "./utils/Datadog.mts";
import { Logger } from "./utils/Loggers.mts";
import { parseArgs } from "node:util";
import { plugins as availablePlugins } from "./plugins/index.mts";
import { filterPlugins, runPlugin } from "./utils/plugins.mts";

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

    const selectedPlugins = filterPlugins(availablePlugins, args.values.plugin);

    if (selectedPlugins.length === 0) {
      throw new Error("No plugins found");
    }

    const promises: Promise<void>[] = [];

    for (const Plugin of selectedPlugins) {
      promises.push(runPlugin(Plugin));
    }

    await Promise.all(promises);
  } catch (error) {
    logger.error(error as Error);
  } finally {
    await datadog.flush();
  }
}

main();
