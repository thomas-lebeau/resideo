import * as dotenv from "dotenv";
import { parseArgs } from "node:util";

export const args = parseArgs({
  args: process.argv.slice(2),
  strict: true,
  options: {
    plugin: {
      type: "string",
      short: "p",
      long: "plugin",
      multiple: true,
      default: ["all"],
    },
    env: {
      type: "string",
      short: "e",
      long: "env",
      multiple: true,
      default: [".env"],
    },
    help: {
      type: "boolean",
      long: "help",
      multiple: false,
      short: "h",
      default: false,
    },
    version: {
      type: "boolean",
      long: "version",
      short: "v",
      multiple: false,
      default: false,
    },
    dryRun: {
      type: "boolean",
      short: "d",
      long: "dry-run",
      multiple: false,
      default: false,
    },
    update: {
      type: "boolean",
      short: "u",
      long: "update",
      multiple: false,
      default: false,
    },
  },
});

dotenv.config({
  path: args.values.env,
  quiet: true,
  override: true,
});

export const config = {
  PACKAGE_VERSION: getBuildConstant("PACKAGE_VERSION", "2.1.1"),
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
