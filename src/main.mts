#!/usr/bin/env node

import "source-map-support/register.js";
import "./utils/tracer.mts";

import datadog from "./utils/Datadog.mts";
import logger from "./utils/Loggers.mts";

import { args } from "./utils/args.mts";
import { help } from "./commands/help.mts";
import { version } from "./commands/version.mts";
import { update } from "./commands/update.mts";
import { listPlugins } from "./commands/list-plugins.mts";
import { forEachPlugin } from "./utils/plugins.mts";
import type { AbstractPlugin } from "./shared/AbstractPlugin.mts";

const ONE_MINUTE = 60_000 as const;

async function main(): Promise<void> {
  let isShuttingDown = false;
  let count = 0;

  async function collectAndSendData() {
    count++;

    await forEachPlugin(async (plugin) => {
      const Plugin = plugin.constructor as typeof AbstractPlugin;

      if (count % Plugin.interval !== 0) {
        return;
      }

      plugin.logger.info(`🔄 Running plugin ${Plugin.slug}...`);

      const data = await plugin.run();

      if (data) {
        datadog.send(Plugin.slug, data);
      }
    });

    await datadog.flush();
  }

  async function shutdown() {
    // Prevent multiple shutdowns
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    clearTimeout(timeout);

    await forEachPlugin(async (plugin) => plugin.stop());
    await datadog.flush();

    logger.info("Shutting down...");

    process.exit(0);
  }

  if (args.values.help) {
    return help();
  }

  if (args.values["list-plugins"]) {
    return listPlugins();
  }

  if (args.values.version) {
    return version();
  }

  if (args.values.update) {
    return await update();
  }

  if (args.values.setup) {
    return await forEachPlugin(async (plugin) => plugin.setup());
  }

  if (args.values["clear-store"]) {
    return await forEachPlugin(async (plugin) => plugin.clearStore());
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await collectAndSendData();

  const timeout = setInterval(() => collectAndSendData(), ONE_MINUTE);

  // This promise never resolves, keeping the process alive
  await new Promise(() => {});
}

main();
