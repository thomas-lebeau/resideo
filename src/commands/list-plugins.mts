import logger from "../utils/Loggers.mts";
import { plugins as availablePlugins } from "../plugins/index.mts";

export function listPlugins() {
  logger.info(`
Available Plugins:
${getListOfPlugins()}
`);
  return;
}

function getListOfPlugins() {
  const maxSlugLength = Math.max(
    ...availablePlugins.map((Plugin) => Plugin.slug.length)
  );

  return availablePlugins
    .map((Plugin) => {
      const paddedSlug = Plugin.slug.padEnd(maxSlugLength);
      return `  ${paddedSlug}    ${Plugin.description}`;
    })
    .join("\n");
}
