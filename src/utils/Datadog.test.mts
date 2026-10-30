import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";

import { Datadog, flattenErrorCauses, formatLogPayload } from "./Datadog.mts";

describe("formatLogPayload", () => {
  test("drops empty payloads", () => {
    assert.equal(formatLogPayload(undefined), undefined);
    assert.equal(formatLogPayload(null), undefined);
    assert.equal(formatLogPayload(""), undefined);
  });

  test("wraps primitives in a message", () => {
    assert.deepEqual(formatLogPayload("hello"), { message: "hello" });
    assert.deepEqual(formatLogPayload(42), { message: "42" });
    assert.deepEqual(formatLogPayload(false), { message: "false" });
  });

  test("passes objects through unchanged", () => {
    const payload = { type: "light", name: "Kitchen", state: 1 };
    assert.equal(formatLogPayload(payload), payload);
  });

  test("formats errors with their causes and code", () => {
    const root = Object.assign(new TypeError("socket hang up"), {
      code: "ECONNRESET",
    });
    const error = new Error("Failed to fetch", { cause: root });

    const formatted = formatLogPayload(error);

    assert.deepEqual(formatted, {
      status: "error",
      message: "Failed to fetch",
      error: {
        type: "Error",
        message: "Failed to fetch",
        stack: error.stack,
        causes: [
          {
            type: "TypeError",
            message: "socket hang up",
            stack: root.stack,
            code: "ECONNRESET",
          },
        ],
      },
    });
  });
});

describe("flattenErrorCauses", () => {
  test("returns an empty list for non errors", () => {
    assert.deepEqual(flattenErrorCauses("oops"), []);
    assert.deepEqual(flattenErrorCauses(new Error("no cause")), []);
  });

  test("walks the cause chain in order", () => {
    const error = new Error("a", {
      cause: new Error("b", { cause: new Error("c") }),
    });

    assert.deepEqual(
      flattenErrorCauses(error).map((cause) => cause.message),
      ["b", "c"]
    );
  });

  test("stops at non error causes", () => {
    const error = new Error("a", {
      cause: new Error("b", { cause: "not an error" }),
    });

    assert.deepEqual(
      flattenErrorCauses(error).map((cause) => cause.message),
      ["b"]
    );
  });

  test("caps the chain at 10 causes", () => {
    const cyclic = new Error("cyclic");
    cyclic.cause = cyclic;

    assert.equal(flattenErrorCauses(cyclic).length, 10);
  });
});

describe("Datadog.flush", () => {
  let requests: Array<Array<{ message: string }>>;
  let statuses: Array<number | Error>;

  beforeEach(() => {
    requests = [];
    statuses = [];
    mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
      requests.push(JSON.parse(init.body as string));
      const status = statuses.shift() ?? 202;
      if (status instanceof Error) {
        throw status;
      }
      return new Response(null, { status });
    });
    // Keep the test output clean
    mock.method(console, "info", () => {});
    mock.method(console, "warn", () => {});
    mock.method(console, "error", () => {});
  });

  afterEach(() => {
    mock.restoreAll();
  });

  const messages = (count: number, from = 0) =>
    Array.from({ length: count }, (_, i) => `log ${from + i}`);

  test("sends logs in chunks of at most maxBatchEntries", async () => {
    const datadog = new Datadog({ maxBatchEntries: 2 });
    datadog.send("test", messages(5));

    await datadog.flush();

    assert.deepEqual(
      requests.map((logs) => logs.map((log) => log.message)),
      [["log 0", "log 1"], ["log 2", "log 3"], ["log 4"]]
    );
    assert.equal(datadog.size, 0);
  });

  test("sends logs in chunks of at most maxBatchBytes", async () => {
    const datadog = new Datadog({ maxBatchBytes: 1000 });
    datadog.send("test", messages(10));

    await datadog.flush();

    assert.ok(requests.length > 1);
    assert.equal(requests.flat().length, 10);
    for (const logs of requests) {
      assert.ok(Buffer.byteLength(JSON.stringify(logs)) <= 1000);
    }
  });

  test("keeps unsent logs on a retryable error, in order", async () => {
    const datadog = new Datadog({ maxBatchEntries: 2 });
    datadog.send("test", messages(5));
    statuses = [202, 503];

    await datadog.flush();

    // stops sending after the first failure
    assert.equal(requests.length, 2);
    assert.equal(datadog.size, 3);

    datadog.send("test", "log 5");
    requests = [];
    await datadog.flush();

    assert.deepEqual(
      requests.flat().map((log) => log.message),
      messages(4, 2)
    );
  });

  test("keeps unsent logs on network errors", async () => {
    const datadog = new Datadog();
    datadog.send("test", messages(3));
    statuses = [new TypeError("fetch failed")];

    await datadog.flush();

    assert.equal(datadog.size, 3);
  });

  for (const status of [408, 429, 500]) {
    test(`retries on HTTP ${status}`, async () => {
      const datadog = new Datadog();
      datadog.send("test", messages(3));
      statuses = [status];

      await datadog.flush();

      assert.equal(datadog.size, 3);
    });
  }

  test("drops chunks rejected with a non retryable 4xx", async () => {
    const datadog = new Datadog({ maxBatchEntries: 2 });
    datadog.send("test", messages(4));
    statuses = [413, 202];

    await datadog.flush();

    assert.equal(requests.length, 2);
    assert.equal(datadog.size, 0);
  });

  test("drops the oldest logs when the queue is full", async () => {
    const datadog = new Datadog({ maxQueueSize: 3 });
    datadog.send("test", messages(5));

    assert.equal(datadog.size, 3);

    await datadog.flush();

    assert.deepEqual(
      requests.flat().map((log) => log.message),
      messages(3, 2)
    );
  });

  test("caps the queue when failed logs are put back", async () => {
    const datadog = new Datadog({ maxQueueSize: 3 });
    datadog.send("test", messages(3));
    statuses = [503];

    const flushing = datadog.flush();
    // logs sent while the request is in flight
    datadog.send("test", messages(2, 3));
    await flushing;

    assert.equal(datadog.size, 3);

    requests = [];
    await datadog.flush();

    assert.deepEqual(
      requests.flat().map((log) => log.message),
      messages(3, 2)
    );
  });
});
