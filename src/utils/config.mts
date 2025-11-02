import * as dotenv from "dotenv";
import {
  getPackageVersion,
  getGitCommitSha,
  getGitRepositoryUrl,
  getPackageName,
} from "./package.mts";
import { args } from "./args.mts";

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
  LOG_LEVEL: process.env.LOG_LEVEL,
} as const;

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
