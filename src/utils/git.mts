import { execSync } from "node:child_process";

const OPTIONS = {
  encoding: "utf8",
} as const;

export const DD_GIT_COMMIT_SHA = execSync("git rev-parse HEAD", OPTIONS).trim();
export const DD_GIT_REPOSITORY_URL = execSync(
  "git config --get remote.origin.url",
  OPTIONS
).trim();
