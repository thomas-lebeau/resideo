/* eslint-disable no-console */

import datadog from "./Datadog.mts";
import { config } from "./config.mts";

// @see https://en.wikipedia.org/wiki/Syslog#Severity_level
const LOG_LEVEL = {
  emerg: 0, // used to silently ignore messages
  error: 3,
  warning: 4,
  info: 6,
  debug: 7,
} as const;

type LogLevel = (typeof LOG_LEVEL)[keyof typeof LOG_LEVEL];

// [Console Loglevel, Datadog Loglevel]
const DEFAULT_LOG_LEVELS: [LogLevel, LogLevel] = [
  +(config.LOG_LEVEL ?? LOG_LEVEL.info) as LogLevel,
  LOG_LEVEL.warning,
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

  debug(message: string, payload?: Record<string, unknown>): void {
    if (this.logLevels[0] >= LOG_LEVEL.debug) {
      console.debug(`${this.prefix}${message}`, payload);
    }

    if (this.logLevels[1] >= LOG_LEVEL.debug) {
      datadog.send(this.name, {
        ...payload,
        level: "notice",
        message,
      });
    }
  }

  info(message: string) {
    if (this.logLevels[0] >= LOG_LEVEL.info) {
      console.log(`${this.prefix}${message}`);
    }

    if (this.logLevels[1] >= LOG_LEVEL.info) {
      datadog.send(this.name, message);
    }
  }

  warn(message: string, payload?: Record<string, unknown>): void {
    if (this.logLevels[0] >= LOG_LEVEL.warning) {
      console.warn(`${this.prefix}${message}`);
    }

    if (this.logLevels[1] >= LOG_LEVEL.warning) {
      datadog.send(this.name, {
        ...payload,
        level: "warning",
        message,
      });
    }
  }

  error(error: Error) {
    if (this.logLevels[0] >= LOG_LEVEL.error) {
      console.error(`${this.prefix}❌`, error);
    }

    if (this.logLevels[1] >= LOG_LEVEL.error) {
      datadog.send(this.name, error);
    }
  }
}

export default new Logger();
