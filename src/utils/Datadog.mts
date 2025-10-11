import { hostname } from "node:os";
import { randomUUID } from "node:crypto";

import { DD_GIT_COMMIT_SHA, DD_GIT_REPOSITORY_URL } from "./git.mts";
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
  [key: string]: unknown;
};

type RawLog = unknown;

class Datadog {
  private readonly ddtags = [
    `version:${packageJson.version}`,
    `env:${config.ENV}`,
  ];
  private readonly commonProperties = {
    ddsource: "NodeJS",
    host: hostname(),
    service: packageJson.name,
    // Source code integration
    //
    // Note:
    // This only works because we are runing the code from the local git repository.
    // This is good enough for now but we should evaluate this at build time in the future (in the CI/CD pipeline)
    //
    // @see https://docs.datadoghq.com/integrations/guide/source-code-integration/?tab=civisibility#configure-telemetry-tagging
    git: {
      commit: {
        sha: DD_GIT_COMMIT_SHA,
      },
      repository_url: DD_GIT_REPOSITORY_URL,
    },
  };
  private readonly intakeUrl =
    "https://http-intake.logs.datadoghq.eu/api/v2/logs";
  private readonly searchUrl = `https://app.datadoghq.eu/logs/livetail`;
  private readonly apiKey: string;
  private readonly batch: Array<Log> = [];

  constructor() {
    if (!config.DD_API_KEY) {
      throw new Error("DD_API_KEY is not set");
    }

    this.apiKey = config.DD_API_KEY;
  }

  private batchLog(plugin: string, log: RawLog) {
    const slug = plugin.replaceAll(/ /g, "-").toLowerCase();
    const formatted = formatLogPayload(log);

    if (!formatted) {
      return;
    }

    this.batch.push({
      ...formatted,
      ...this.commonProperties,
      ddtags: this.ddtags.concat(`plugin:${slug}`).join(","),
      timestamp: formatted.timestamp ?? Date.now(),
      logger: {
        name: slug,
      },
    });
  }

  send(plugin: string, data: RawLog | Array<RawLog>) {
    if (Array.isArray(data)) {
      data.forEach((log) => this.batchLog(plugin, log));
    } else {
      this.batchLog(plugin, data);
    }
  }

  private getSearchUrl(requestId: string) {
    const params = new URLSearchParams({
      query: `@request_id:${requestId}`,
      cols: "host,service,env,@logger.name,@name,@type",
    });

    return `${this.searchUrl}?${params.toString()}`;
  }

  async flush() {
    if (this.batch.length === 0) {
      logger.info("No logs to send to Datadog");
      return;
    }

    try {
      const requestId = randomUUID();
      const response = await fetch(
        this.intakeUrl + `?request_id=${requestId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "DD-API-KEY": this.apiKey,
          },
          body: JSON.stringify(this.batch),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      logger.info(`✅ Sent ${this.batch.length} logs to Datadog`);
      logger.info(`🔗 ${this.getSearchUrl(requestId)}`);
    } catch (error) {
      logger.error(
        new Error("Failed to send data to Datadog", { cause: error })
      );
      throw error;
    }
  }
}

export default new Datadog();

function formatLogPayload(
  payload: unknown
): Record<string, unknown> | undefined {
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

  return payload as Record<string, unknown>;
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
