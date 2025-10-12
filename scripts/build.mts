import { execSync } from "node:child_process";
import { build } from "esbuild";
import packageJson from "../package.json" with { type: "json" };

const OPTIONS = {
  encoding: "utf8",
} as const;

export const gitCommitSha = execSync("git rev-parse HEAD", OPTIONS).trim();
export const gitRepositoryUrl = execSync(
  "git config --get remote.origin.url",
  OPTIONS
).trim();


await build({
  entryPoints: ["src/main.mts"],
  outfile: "dist/main.js",
  bundle: true,
  platform: "node",
  target: "node18",
  define: {
    PACKAGE_VERSION: JSON.stringify(packageJson.version),
    PACKAGE_NAME: JSON.stringify(packageJson.name),
    GIT_COMMIT_SHA: JSON.stringify(gitCommitSha),
    GIT_REPOSITORY_URL: JSON.stringify(gitRepositoryUrl),
  },
});
