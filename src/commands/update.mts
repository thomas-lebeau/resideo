import readline from "node:readline/promises";

import { config } from "../utils/config.mts";
import { getLatestVersion } from "../utils/getLatestVersion.mts";
import semver from "semver";
import logger from "../utils/Loggers.mts";
import { execSync } from "node:child_process";

const UPDATE_COMMAND = `curl -fsSL https://raw.githubusercontent.com/thomas-lebeau/resideo/main/scripts/install.sh | bash`;

export async function update() {
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
${UPDATE_COMMAND}

`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await rl.question("Are you sure you want to update? (Y/n) ");

  rl.close();

  const normalizedAnswer = answer.trim().toLowerCase();
  if (
    normalizedAnswer !== "" &&
    normalizedAnswer !== "y" &&
    normalizedAnswer !== "yes"
  ) {
    logger.info("Update cancelled");
    return;
  }

  try {
    execSync(UPDATE_COMMAND, { stdio: "inherit" });
  } catch (error) {
    logger.error(error as Error);
    return;
  }

  return;
}
