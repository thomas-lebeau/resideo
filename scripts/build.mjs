// @ts-check
import process from "node:process";
import { build } from "esbuild";
import { execSync } from "child_process";
import packageJson from "../package.json" with { type: "json" };
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
const gitCommitSha = execSync("git rev-parse HEAD", {encoding: "utf8"}).trim();
const gitRepositoryUrl = execSync("git config --get remote.origin.url", {encoding: "utf8"}).trim().replace(/^https?:\/\//, "git@");

await build({
  entryPoints: ["src/main.mts"],
  outfile: `bin/${packageJson.name}`,
  bundle: true,
  sourcemap: true,
  platform: "node",
  target: "node18",
  external: [
    // Native modules must be external (can't be bundled)
    "@abandonware/noble",
    "@abandonware/bluetooth-hci-socket",
    "ws", // Required by @abandonware/noble
    "node-dht-sensor",
  ],
  banner: {
    js: `
globalThis.PACKAGE_VERSION = "${packageJson.version}${versionSuffix}";
globalThis.PACKAGE_NAME = "${packageJson.name}";
globalThis.GIT_COMMIT_SHA = "${gitCommitSha}";
globalThis.GIT_REPOSITORY_URL = "${gitRepositoryUrl}";
  `,
  },
});
