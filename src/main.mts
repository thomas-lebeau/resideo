#!/usr/bin/env node

import { globSync } from "node:fs";
import { join } from "node:path";
import { Plugin } from "./utils/Plugin.mts";
import datadog from "./utils/Datadog.mts";
import { Logger } from "./utils/Loggers.mts";
import { parseArgs } from "node:util";

const logger = new Logger("Main");

async function main(): Promise<void> {
  try {
    const promises = [];
    const availablePugins = globSync(
      join(import.meta.dirname, "/plugins/*.mts")
    );
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
            availablePugins.find((availablePugin) =>
              availablePugin.includes(selectedPlugin)
            )
          )
          .filter((plugin) => plugin !== undefined)
      : availablePugins;

    if (selectedPlugins.length === 0) {
      logger.error(new Error("No plugins found"));
      return;
    }

    for (const plugin of selectedPlugins) {
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
