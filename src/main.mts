#!/usr/bin/env node

import "./polyfills.js";

import datadog from "./utils/Datadog.mts";
import { Logger } from "./utils/Loggers.mts";
import { plugins as availablePlugins } from "./plugins/index.mts";
import { filterPlugins, runPlugin } from "./utils/plugins.mts";
import { args } from "./utils/config.mts";

const logger = new Logger("Main");

async function main(): Promise<void> {
  try {
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
