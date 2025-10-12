import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

// Defined in scripts/build.mts
declare global {
  var PACKAGE_VERSION: string | undefined;
  var PACKAGE_NAME: string | undefined;
  var GIT_COMMIT_SHA: string | undefined;
  var GIT_REPOSITORY_URL: string | undefined;
}

function getBuildConstant(
  name: keyof typeof globalThis,
  fallback: string
): string {
  return typeof globalThis[name] !== "undefined"
    ? (globalThis[name] as string)
    : fallback;
}

export const config = {
  PACKAGE_VERSION: getBuildConstant("PACKAGE_VERSION", "0.0.0"),
  PACKAGE_NAME: getBuildConstant("PACKAGE_NAME", "raspberry-home-monitor"),
  GIT_COMMIT_SHA: getBuildConstant("GIT_COMMIT_SHA", "unknown"),
  GIT_REPOSITORY_URL: getBuildConstant("GIT_REPOSITORY_URL", "unknown"),

  ENV: process.env.ENV || "dev",
  DEBUG: process.env.DEBUG === "true" || process.env.DEBUG === "1",

  DD_API_KEY: process.env.DD_API_KEY,
};
