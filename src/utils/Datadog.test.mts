import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { flattenErrorCauses, formatLogPayload } from "./Datadog.mts";

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
