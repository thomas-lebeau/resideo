#!/usr/bin/env node

import { globSync } from "node:fs";
import { join } from "node:path";
import { Plugin } from "./utils/Plugin.mts";
import datadog from "./utils/Datadog.mts";
import { Logger } from "./utils/Loggers.mts";

const logger = new Logger("Main");

async function main(): Promise<void> {
  try {
    const promises = [];
    const plugins = globSync(join(import.meta.dirname, "/plugins/*.mts"));

    if (plugins.length === 0) {
      logger.error(new Error("No plugins found"));
      return;
    }

    for (const plugin of plugins) {
      promises.push(new Plugin(plugin).run());
    }

    await Promise.all(promises);
  } catch (error) {
    logger.error(new Error("Unknown error", { cause: error }));
  } finally {
    await datadog.flush();
  }
}

main();
