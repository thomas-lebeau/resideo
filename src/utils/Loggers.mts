/* eslint-disable no-console */

import { inspect } from "node:util";
import datadog from "./Datadog.mts";
import { config } from "./config.mts";

// @see https://en.wikipedia.org/wiki/Syslog#Severity_level
const LOG_LEVEL = {
  emerg: 0, // used to silently ignore messages
  error: 3,
  warn: 4,
  info: 6,
  debug: 7,
} as const;

type LogLevel = (typeof LOG_LEVEL)[keyof typeof LOG_LEVEL];

// [Console Loglevel, Datadog Loglevel]
const DEFAULT_LOG_LEVELS: [LogLevel, LogLevel] = [
  +(config.LOG_LEVEL ?? LOG_LEVEL.info) as LogLevel,
  LOG_LEVEL.warn,
];

export class Logger {
  static LOG_LEVELS = LOG_LEVEL;

  private readonly name: string;
  private readonly prefix: string;
  private readonly logLevels: [LogLevel, LogLevel];

  constructor(
    name: string = "",
    logLevels: [LogLevel | undefined, LogLevel | undefined] = DEFAULT_LOG_LEVELS
  ) {
    this.name = name;
    this.prefix = name ? `[${name}]`.padEnd(20, " ") + "" : "";
    this.logLevels = [
      logLevels[0] ?? DEFAULT_LOG_LEVELS[0],
      logLevels[1] ?? DEFAULT_LOG_LEVELS[1],
    ];
  }

  private log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    payload?: Record<string, unknown> | Error
  ): void {
    if (this.logLevels[0] >= LOG_LEVEL[level]) {
      console[level](
        `${this.prefix}${message}`,
        inspect(payload, { depth: 5, colors: true })
      );
    }

    if (this.logLevels[1] >= LOG_LEVEL[level]) {
      datadog.send(
        this.name,
        payload instanceof Error ? payload : { ...payload, level, message }
      );
    }
  }

  debug(message: string, payload?: Record<string, unknown>): void {
    this.log("debug", message, payload);
  }

  info(message: string) {
    this.log("info", message);
  }

  warn(message: string, payload?: Record<string, unknown>): void {
    this.log("warn", message, payload);
  }

  error(error: Error) {
    this.log("error", error.message, error);
  }
}

export default new Logger();
