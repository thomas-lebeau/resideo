import { config } from "../utils/config.mts";
import logger from "../utils/Loggers.mts";
import { plugins as availablePlugins } from "../plugins/index.mts";

export function help() {
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
${listPlugins()}

Examples:
  ${config.PACKAGE_NAME} -e ~/.path/to/.env
`);
  return;
}

function listPlugins() {
  const maxSlugLength = Math.max(
    ...availablePlugins.map((Plugin) => Plugin.slug.length)
  );

  return availablePlugins
    .map((Plugin) => {
      const paddedSlug = Plugin.slug.padEnd(maxSlugLength);
      return `  ${paddedSlug}  ${Plugin.description}`;
    })
    .join("\n");
}
