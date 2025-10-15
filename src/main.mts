#!/usr/bin/env node

import "source-map-support/register.js";
import "./polyfills.js";

import datadog from "./utils/Datadog.mts";
import logger from "./utils/Loggers.mts";
import { getSelectedPlugins, runPlugin } from "./utils/plugins.mts";
import { args } from "./utils/config.mts";
import { help } from "./commands/help.mts";
import { version } from "./commands/version.mts";
import { update } from "./commands/update.mts";

let exitCode = 0;

async function main(): Promise<void> {
  if (args.values.help) {
    return help();
  }

  if (args.values.version) {
    return version();
  }

  if (args.values.update) {
    return await update();
  }

  try {
    const selectedPlugins = getSelectedPlugins();

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
    exitCode = 1;
  } finally {
    await datadog.flush();
    process.exit(exitCode);
  }
}

main();
