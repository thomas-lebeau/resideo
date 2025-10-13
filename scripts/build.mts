import { build } from "esbuild";
import {
  getGitCommitSha,
  getGitRepositoryUrl,
  getPackageName,
  getPackageVersion,
} from "../src/utils/package.mts";

await build({
  entryPoints: ["src/main.mts"],
  outfile: `bin/${getPackageName()}`,
  bundle: true,
  platform: "node",
  target: "node18",
  sourcemap: true,
  banner: {
    js: `
globalThis.PACKAGE_VERSION = "${getPackageVersion()}";
globalThis.PACKAGE_NAME = "${getPackageName()}";
globalThis.GIT_COMMIT_SHA = "${getGitCommitSha()}";
globalThis.GIT_REPOSITORY_URL = "${getGitRepositoryUrl()}";
  `,
  },
});
