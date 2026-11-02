import { afterEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";

import datadog from "./Datadog.mts";
import { Logger } from "./Loggers.mts";

describe("Logger.prompt", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  test("prints the message unprefixed to stdout, whatever the log level", () => {
    const logSpy = mock.method(console, "log", () => {});
    mock.method(datadog, "send", () => {});
    const logger = new Logger("my-plugin", [
      Logger.LOG_LEVELS.emerg,
      Logger.LOG_LEVELS.emerg,
    ]);

    logger.prompt("1. Visit: https://example.com");

    assert.equal(logSpy.mock.callCount(), 1);
    assert.deepEqual(logSpy.mock.calls[0].arguments, [
      "1. Visit: https://example.com",
    ]);
  });

  test("never sends the message to Datadog", () => {
    mock.method(console, "log", () => {});
    const sendSpy = mock.method(datadog, "send", () => {});
    const logger = new Logger("my-plugin", [
      Logger.LOG_LEVELS.debug,
      Logger.LOG_LEVELS.debug,
    ]);

    logger.prompt("2. Enter code: ABCD-1234");

    assert.equal(sendSpy.mock.callCount(), 0);
  });
});
