import { build } from "esbuild";
import {
  getGitCommitSha,
  getGitRepositoryUrl,
  getPackageName,
  getPackageVersion,
} from "../src/utils/package.mts";
import { parseArgs } from "util";

const args = parseArgs({
  args: process.argv.slice(2),
  strict: true,
  options: {
    dev: {
      type: "boolean",
      default: false,
    },
  },
});

const versionSuffix = args.values.dev ? "-dev" : "";

await build({
  entryPoints: ["src/main.mts"],
  outfile: `bin/${getPackageName()}`,
  bundle: true,
  platform: "node",
  target: "node18",
  banner: {
    js: `
globalThis.PACKAGE_VERSION = "${getPackageVersion()}${versionSuffix}";
globalThis.PACKAGE_NAME = "${getPackageName()}";
globalThis.GIT_COMMIT_SHA = "${getGitCommitSha()}";
globalThis.GIT_REPOSITORY_URL = "${getGitRepositoryUrl()}";
  `,
  },
});
