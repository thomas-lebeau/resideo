import { execSync } from "child_process";
import packageJson from "../../package.json" with { type: "json" };

const OPTIONS = {
  encoding: "utf8",
} as const;

export function getPackageName(): string {
  return packageJson.name;
}

export function getPackageVersion(): string {
  return packageJson.version;
}

export function getGitCommitSha(): string {
  return execSync("git rev-parse HEAD", OPTIONS).trim();
}

export function getGitRepositoryUrl(): string {
  return execSync("git config --get remote.origin.url", OPTIONS).trim().replace(/^https?:\/\/(.*)$/g, "git@$1.git")
}
