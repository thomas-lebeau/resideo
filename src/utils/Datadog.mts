import { hostname } from "node:os";
import { randomUUID } from "node:crypto";

import { config } from "./config.mts";
import { args } from "./args.mts";
import { Logger } from "./Loggers.mts";

// Prevent Datadog error to be reported to Datadog
const logger = new Logger("Datadog", [
  undefined, // use default
  Logger.LOG_LEVELS.emerg, // silently ignore messages
]);

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
    `version:${config.PACKAGE_VERSION}`,
    `env:${config.ENV}`,
  ];
  private readonly commonProperties = {
    ddsource: "NodeJS",
    node_version: process.version,
    host: hostname(),
    service: config.PACKAGE_NAME,
    // Source code integration
    // @see https://docs.datadoghq.com/integrations/guide/source-code-integration/?tab=civisibility#configure-telemetry-tagging
    git: {
      commit: {
        sha: config.GIT_COMMIT_SHA,
      },
      repository_url: config.GIT_REPOSITORY_URL,
    },
  };
  private readonly site = process.env.DD_SITE || "datadoghq.com";
  private readonly intakeUrl = `https://http-intake.logs.${this.site}/api/v2/logs`;
  private readonly searchUrl = `https://app.${this.site}/logs/livetail`;
  private readonly apiKey: string;
  private readonly batch: Array<Log> = [];

  constructor() {
    if (!process.env.DD_API_KEY) {
      throw new Error("DD_API_KEY is not set");
    }

    this.apiKey = process.env.DD_API_KEY;
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

    const currentBatch = this.batch.splice(0);

    if (args.values.dryRun) {
      logger.debug("Batch", { batch: currentBatch });
      logger.info(
        `Dry run mode, skipping sending ${currentBatch.length} logs to Datadog`
      );
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
          body: JSON.stringify(currentBatch),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      logger.info(`✅ Sent ${currentBatch.length} logs to Datadog`);
      logger.info(`🔗 ${this.getSearchUrl(requestId)}`);
    } catch (error) {
      // Restore the batch in case of error
      this.batch.unshift(...currentBatch);

      logger.error(
        new Error("Failed to send data to Datadog", { cause: error })
      );
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
        type: payload.name,
        message: payload.message,
        stack: payload.stack,
        causes: flattenErrorCauses(payload),
        ...("code" in payload ? { code: payload.code } : {}),
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
      type: currentError.name,
      message: currentError.message,
      stack: currentError.stack,
      ...("code" in currentError ? { code: currentError.code } : {}),
    });

    currentError = currentError.cause;
  }

  return causes;
}

function isError(payload: unknown): payload is Error {
  return payload instanceof Error;
}
