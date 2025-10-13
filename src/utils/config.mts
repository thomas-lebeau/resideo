import * as dotenv from "dotenv";
import { parseArgs } from "node:util";
import {
  getPackageVersion,
  getGitCommitSha,
  getGitRepositoryUrl,
  getPackageName,
} from "./package.mts";

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
    "no-plugin": {
      type: "string",
      long: "no-plugin",
      multiple: true,
      default: [],
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
  // when not defined at build time, this means we are running the code from the local git repository
  // so we need to add the git commit sha because the package version might not change between commits
  PACKAGE_VERSION: getBuildConstant(
    "PACKAGE_VERSION",
    () => `${getPackageVersion()}-dev`
  ),
  PACKAGE_NAME: getBuildConstant("PACKAGE_NAME", getPackageName),
  GIT_COMMIT_SHA: getBuildConstant("GIT_COMMIT_SHA", getGitCommitSha),
  GIT_REPOSITORY_URL: getBuildConstant(
    "GIT_REPOSITORY_URL",
    getGitRepositoryUrl
  ),

  ENV: process.env.ENV || "dev",
  DEBUG: process.env.DEBUG === "true" || process.env.DEBUG === "1",
};

function getBuildConstant(
  name: keyof typeof globalThis,
  fallback: string | (() => string)
): string {
  return typeof globalThis[name] !== "undefined"
    ? (globalThis[name] as string)
    : typeof fallback === "function"
    ? fallback()
    : fallback;
}
