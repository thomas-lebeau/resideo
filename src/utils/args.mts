import type { ParseArgsOptionDescriptor } from "node:util";
import { parseArgs } from "node:util";

export const argsConfig = {
  help: {
    type: "boolean",
    multiple: false,
    short: "h",
    default: false,
    description: "Show help",
  },
  "list-plugins": {
    type: "boolean",
    short: "l",
    multiple: false,
    default: false,
    description: "List available plugins",
  },
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
  setup: {
    type: "boolean",
    short: "s",
    multiple: false,
    default: false,
    description: "Setup the plugins authentication tokens",
  },
  "clear-store": {
    type: "boolean",
    short: "S",
    multiple: false,
    default: false,
    description: "Clear the plugin store files",
  },
  dryRun: {
    type: "boolean",
    short: "d",
    multiple: false,
    default: false,
    description: "Run in dry-run mode (no data will be sent to Datadog)",
  },
  version: {
    type: "boolean",
    short: "v",
    multiple: false,
    default: false,
    description: "Show version",
  },
  update: {
    type: "boolean",
    short: "u",
    multiple: false,
    default: false,
    description: "Update the application",
  },
} as const satisfies {
  [longOption: string]: ParseArgsOptionDescriptor & { description?: string };
};

export const args = parseArgs({
  args: process.argv.slice(2),
  strict: true,
  options: argsConfig,
});
