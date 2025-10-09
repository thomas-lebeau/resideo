import { capitalize } from "../shared/index.mts";
import { config } from "./config.mts";
import datadog from "./Datadog.mts";

const REPORTER = {
  datadog: "datadog",
  console: "console",
} as const;

type Reporter = (typeof REPORTER)[keyof typeof REPORTER];

type Reporters = {
  info: Reporter[];
  error: Reporter[];
};

const DEFAULT_REPORTERS: Reporters = {
  info: config.DEBUG ? [REPORTER.console] : [],
  error: [REPORTER.console, REPORTER.datadog],
};

export class Logger {
  static REPORTER = REPORTER;

  private readonly name: string;
  private readonly prefix: string;
  private readonly reporters: Reporters;

  constructor(name: string, reporters: Partial<Reporters> = DEFAULT_REPORTERS) {
    this.name = name;
    this.prefix = `[${capitalize(name)}]`.padEnd(20, " ");
    this.reporters = {
      ...DEFAULT_REPORTERS,
      ...reporters,
    };

    // Force console reporters if DEBUG is enabled
    if (config.DEBUG) {
      this.reporters.info.push(REPORTER.console);
      this.reporters.error.push(REPORTER.console);
    }
  }

  info(message: string) {
    if (this.reporters.info.includes(REPORTER.console)) {
      console.log(`${this.prefix} ${message}`);
    }

    if (this.reporters.info.includes(REPORTER.datadog)) {
      datadog.send(this.name, message);
    }
  }

  error(error: Error) {
    if (this.reporters.error.includes(REPORTER.console)) {
      console.error(`${this.prefix} ❌`, error);
    }

    if (this.reporters.error.includes(REPORTER.datadog)) {
      datadog.send(this.name, error);
    }
  }
}
