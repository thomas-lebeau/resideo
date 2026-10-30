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

type DatadogOptions = {
  /** Max number of logs kept in memory while Datadog is unreachable */
  maxQueueSize?: number;
  /** Max number of logs per request */
  maxBatchEntries?: number;
  /** Max uncompressed payload size per request, in bytes */
  maxBatchBytes?: number;
};

/**
 * Logs intake limits: 1000 entries and 5MB (uncompressed) per request
 * @see https://docs.datadoghq.com/api/latest/logs/#send-logs
 */
const MAX_BATCH_ENTRIES = 1000;
const MAX_BATCH_BYTES = 5_000_000;
// ~8h of logs at ~20 logs per minute
const MAX_QUEUE_SIZE = 10_000;

export class Datadog {
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
  private readonly maxQueueSize: number;
  private readonly maxBatchEntries: number;
  private readonly maxBatchBytes: number;
  private dropped = 0;

  constructor({
    maxQueueSize = MAX_QUEUE_SIZE,
    maxBatchEntries = MAX_BATCH_ENTRIES,
    maxBatchBytes = MAX_BATCH_BYTES,
  }: DatadogOptions = {}) {
    if (!process.env.DD_API_KEY) {
      throw new Error("DD_API_KEY is not set");
    }

    this.apiKey = process.env.DD_API_KEY;
    this.maxQueueSize = maxQueueSize;
    this.maxBatchEntries = maxBatchEntries;
    this.maxBatchBytes = maxBatchBytes;
  }

  get size() {
    return this.batch.length;
  }

  /**
   * Drop the oldest logs when the queue is over capacity
   */
  private trim() {
    const overflow = this.batch.length - this.maxQueueSize;

    if (overflow > 0) {
      this.batch.splice(0, overflow);
      this.dropped += overflow;
    }
  }

  /**
   * Put logs back at the front of the queue so they are retried first
   */
  private requeue(logs: Array<Log>) {
    this.batch.unshift(...logs);
    this.trim();
  }

  /**
   * Split logs into request bodies that fit the intake limits
   */
  private chunk(logs: Array<Log>) {
    const chunks: Array<{ logs: Array<Log>; body: string }> = [];
    let entries: Array<Log> = [];
    let parts: Array<string> = [];
    let bytes = 2; // []

    for (const log of logs) {
      const part = JSON.stringify(log);
      const partBytes = Buffer.byteLength(part) + 1; // ,

      if (
        entries.length > 0 &&
        (entries.length >= this.maxBatchEntries ||
          bytes + partBytes > this.maxBatchBytes)
      ) {
        chunks.push({ logs: entries, body: `[${parts.join(",")}]` });
        entries = [];
        parts = [];
        bytes = 2;
      }

      entries.push(log);
      parts.push(part);
      bytes += partBytes;
    }

    if (entries.length > 0) {
      chunks.push({ logs: entries, body: `[${parts.join(",")}]` });
    }

    return chunks;
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
    this.trim();
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
    if (this.dropped > 0) {
      logger.warn(
        `Queue full, dropped ${this.dropped} oldest logs since last flush`
      );
      this.dropped = 0;
    }

    if (this.batch.length === 0) {
      logger.info("No logs to send to Datadog");
      return;
    }

    const pending = this.batch.splice(0);

    if (args.values["dry-run"]) {
      logger.debug("Batch", { batch: pending });
      logger.info(
        `Dry run mode, skipping sending ${pending.length} logs to Datadog`
      );
      return;
    }

    let sent = 0;

    for (const { logs, body } of this.chunk(pending)) {
      const requestId = randomUUID();
      let response: Response;

      try {
        response = await fetch(this.intakeUrl + `?request_id=${requestId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "DD-API-KEY": this.apiKey,
          },
          body,
        });
      } catch (error) {
        // Network error: retry this chunk and the remaining ones on next flush
        this.requeue(pending.slice(sent));
        logger.error(
          new Error("Failed to send data to Datadog", { cause: error })
        );
        return;
      }

      if (response.ok) {
        logger.info(`✅ Sent ${logs.length} logs to Datadog`);
        logger.info(`🔗 ${this.getSearchUrl(requestId)}`);
      } else if (isRetryable(response.status)) {
        this.requeue(pending.slice(sent));
        logger.error(
          new Error("Failed to send data to Datadog", {
            cause: new Error(`HTTP error! status: ${response.status}`),
          })
        );
        return;
      } else {
        // Retrying would fail the same way, and block the queue forever
        logger.error(
          new Error(`Dropped ${logs.length} logs rejected by Datadog`, {
            cause: new Error(`HTTP error! status: ${response.status}`),
          })
        );
      }

      sent += logs.length;
    }
  }
}

/**
 * Server errors, timeouts and rate limits are transient, other 4xx are not
 */
function isRetryable(status: number) {
  return status >= 500 || status === 408 || status === 429;
}

export default new Datadog();

export function formatLogPayload(
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

export function flattenErrorCauses(error: unknown) {
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
