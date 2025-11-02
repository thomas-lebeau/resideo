import { argsConfig } from "../utils/args.mts";
import { config } from "../utils/config.mts";
import logger from "../utils/Loggers.mts";

export function help() {
  logger.info(`
Collects data from various sources and sends it to Datadog as logs.

Usage:
  ${config.PACKAGE_NAME} [options]

Options:
${listOptions()}

Examples:
  ${config.PACKAGE_NAME}
  ${config.PACKAGE_NAME} -e ~/.path/to/.env
  ${config.PACKAGE_NAME} -p resideo -p philips-hue -x fast-speed-test
  ${config.PACKAGE_NAME} -p balay-dishwasher --setup
`);
  return;
}

function listOptions() {
  const configEntries = Object.entries(argsConfig);

  // Calculate the maximum length for proper alignment
  const maxOptionLength = Math.max(
    ...configEntries.map(([key, value]) => `-${value.short}, --${key}`.length)
  );

  return configEntries
    .map(([key, value]) => {
      const optionStr = `-${value.short}, --${key}`;
      const paddedOption = optionStr.padEnd(maxOptionLength);
      return `  ${paddedOption}    ${value.description}`;
    })
    .join("\n");
}
