#!/usr/bin/env node

import "./polyfills.js";

import datadog from "./utils/Datadog.mts";
import { Logger } from "./utils/Loggers.mts";
import { plugins as availablePlugins } from "./plugins/index.mts";
import { filterPlugins, runPlugin } from "./utils/plugins.mts";
import { args, config } from "./utils/config.mts";
import semver from "semver";
import { getLatestVersion } from "./utils/getLatestVersion.mts";

// Force console reporters for the main logger
const logger = new Logger("", { info: [Logger.REPORTER.console] });
let exitCode = 0;

async function main(): Promise<void> {
  if (args.values.help) {
    logger.info(`
Collects data from various sources and sends it to Datadog as logs.

Usage: ${config.PACKAGE_NAME} [options]

Options:
  -p, --plugin <plugin>  Plugins to run (default: all)
  -e, --env <env>        Environment variables file (default: .env)
  -v, --version          Show the version of the application
  -d, --dry-run          Dry run the application
  -u, --update           Update the application
  -h, --help             Show the help

Plugins:
${availablePlugins
  .map((Plugin) => `  ${Plugin.slug} - ${Plugin.description}`)
  .join("\n")}

Examples:
  ${config.PACKAGE_NAME} -e ~/.path/to/.env
`);
    return;
  }

  if (args.values.version) {
    logger.info(`
${config.PACKAGE_NAME}
Version: ${config.PACKAGE_VERSION}
`);
    return;
  }

  if (args.values.update) {
    const latestVersion = await getLatestVersion();
    if (semver.gte(config.PACKAGE_VERSION, latestVersion)) {
      logger.info(
        `You are already on the latest version (v${config.PACKAGE_VERSION})`
      );
      return;
    }
    logger.info(`
New version available: ${latestVersion}

To update the application, run the following command:
curl -fsSL https://raw.githubusercontent.com/thomas-lebeau/resideo/main/scripts/install.sh | bash
`);
    return;
  }

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
    exitCode = 1;
  } finally {
    await datadog.flush();
    process.exit(exitCode);
  }
}

main();
