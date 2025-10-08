import { hostname } from "node:os";

import { config } from "./config.mts";
import { Logger } from "./Loggers.mts";
import packageJson from "../../package.json" with { type: "json" };

// Prevent Datadog error to be reported to Datadog
const logger = new Logger("Datadog", { error: [Logger.REPORTER.console] });

/**
 * @see https://docs.datadoghq.com/api/latest/logs/
 */
type Log = {
  ddsource?: string;
  ddtags?: string;
  hostname?: string;
  message?: string;
  service?: string;
  logger?: {
    name: string;
  };
  error?: {
    type: "Error";
    message: string;
    stack: string;
    causes: Array<{
      type: "Error";
      message: string;
      stack: string;
    }>;
  };
  [key: string]: any;
};

class Datadog {
  private readonly ddsource = "NodeJS";
  private readonly service = packageJson.name;
  private readonly ddtags = [
    `version:${packageJson.version}`,
    `env:${config.ENV}`,
  ];
  private readonly apiKey: string;
  private readonly intakeUrl =
    "https://http-intake.logs.datadoghq.eu/api/v2/logs";
  private readonly searchUrl = `https://app.datadoghq.eu/logs?query=@service:${this.service}`;
  private readonly batch: Array<Log> = [];

  constructor() {
    if (!config.DD_API_KEY) {
      throw new Error("DD_API_KEY is not set");
    }

    this.apiKey = config.DD_API_KEY;
  }

  send(plugin: string, payload: unknown) {
    const slug = plugin.replaceAll(/ /g, "-").toLowerCase();
    const formatted = formatLogPayload(payload);

    if (!formatted) {
      return;
    }

    this.batch.push({
      ...formatted,
      ddsource: this.ddsource,
      ddtags: this.ddtags.concat(`plugin:${slug}`).join(","),
      host: hostname(),
      service: this.service,
      timestamp: Date.now(),
      logger: {
        name: slug,
      },
    });
  }

  async flush() {
    if (this.batch.length === 0) {
      logger.info("No logs to send to Datadog");
      return;
    }

    try {
      const response = await fetch(this.intakeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "DD-API-KEY": this.apiKey,
        },
        body: JSON.stringify(this.batch),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      logger.info(`✅ Sent ${this.batch.length} logs to Datadog`);
      logger.info(`🔗 ${this.searchUrl}`);
    } catch (error) {
      logger.error(
        new Error("Failed to send data to Datadog", { cause: error })
      );
      throw error;
    }
  }
}

export default new Datadog();

function formatLogPayload(payload: unknown): Record<string, any> | undefined {
  if (payload === undefined || payload === null || payload === "") {
    return undefined;
  }

  if (payload instanceof Error) {
    return {
      status: "error",
      message: payload.message,
      error: {
        message: payload.message,
        stack: payload.stack,
        causes: flattenErrorCauses(payload),
      },
    };
  }

  if (typeof payload !== "object") {
    return {
      message: String(payload),
    };
  }

  return payload;
}

function flattenErrorCauses(error: unknown) {
  if (!isError(error)) {
    return [];
  }

  let currentError = error.cause;
  const causes = [];

  while (currentError instanceof Error && causes.length < 10) {
    causes.push({
      type: "Error",
      message: currentError.message,
      stack: currentError.stack,
    });

    currentError = currentError.cause;
  }

  return causes;
}

function isError(payload: unknown): payload is Error {
  return payload instanceof Error;
}
