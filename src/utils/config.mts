import * as dotenv from "dotenv";
import { parseArgs } from "node:util";

export const args = parseArgs({
  args: process.argv.slice(2),
  options: {
    plugin: {
      type: "string",
      short: "p",
      long: "plugin",
      multiple: true,
    },
    env: {
      type: "string",
      short: "e",
      long: "env",
      multiple: true,
      default: [".env"],
    },
  },
});

dotenv.config({
  path: args.values.env,
  quiet: true,
  override: true,
});

export const config = {
  PACKAGE_VERSION: getBuildConstant("PACKAGE_VERSION", "0.0.0"),
  PACKAGE_NAME: getBuildConstant("PACKAGE_NAME", "raspberry-home-monitor"),
  GIT_COMMIT_SHA: getBuildConstant("GIT_COMMIT_SHA", "unknown"),
  GIT_REPOSITORY_URL: getBuildConstant("GIT_REPOSITORY_URL", "unknown"),

  ENV: process.env.ENV || "dev",
  DEBUG: process.env.DEBUG === "true" || process.env.DEBUG === "1",
};

function getBuildConstant(
  name: keyof typeof globalThis,
  fallback: string
): string {
  return typeof globalThis[name] !== "undefined"
    ? (globalThis[name] as string)
    : fallback;
}
