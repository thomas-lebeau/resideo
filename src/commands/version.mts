import { config } from "../utils/config.mts";
import logger from "../utils/Loggers.mts";

export function version() {
  logger.info(`
    ${config.PACKAGE_NAME}
    Version: ${config.PACKAGE_VERSION}
    `);
  return;
}
