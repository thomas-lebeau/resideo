import type { ParseArgsOptionDescriptor } from "node:util";
import { parseArgs } from "node:util";

export const argsConfig: {
  [longOption: string]: ParseArgsOptionDescriptor & { description?: string };
} = {
  plugin: {
    type: "string",
    short: "p",
    multiple: true,
    default: ["all"],
    description: "Plugins to run",
  },
  "no-plugin": {
    type: "string",
    short: "x",
    multiple: true,
    default: [],
    description: "Plugins to exclude",
  },
  env: {
    type: "string",
    short: "e",
    multiple: true,
    default: [".env"],
    description: "Environment variables file",
  },
  help: {
    type: "boolean",
    multiple: false,
    short: "h",
    default: false,
    description: "Show help",
  },
  version: {
    type: "boolean",
    short: "v",
    multiple: false,
    default: false,
    description: "Show version",
  },
  dryRun: {
    type: "boolean",
    short: "d",
    multiple: false,
    default: false,
    description: "Run in dry-run mode (no data will be sent to Datadog)",
  },
  update: {
    type: "boolean",
    short: "u",
    multiple: false,
    default: false,
    description: "Update the application",
  },
  setup: {
    type: "boolean",
    short: "s",
    multiple: false,
    default: false,
    description: "Setup the plugins authentication tokens",
  },
  "list-plugins": {
    type: "boolean",
    short: "l",
    multiple: false,
    default: false,
    description: "List available plugins",
  },
} as const;

export const args = parseArgs({
  args: process.argv.slice(2),
  strict: true,
  options: argsConfig,
});
