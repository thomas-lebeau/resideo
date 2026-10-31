import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { lazyImport } from "./lazyImport.mts";

describe("lazyImport", () => {
  test("does not load until called", () => {
    let calls = 0;
    lazyImport(async () => ({ default: calls++ }));

    assert.equal(calls, 0);
  });

  test("resolves the default export and loads only once", async () => {
    let calls = 0;
    const load = lazyImport(async () => ({ default: ++calls }));

    assert.equal(await load(), 1);
    assert.equal(await load(), 1);
    assert.equal(calls, 1);
  });

  test("rejects when the module cannot be loaded", async () => {
    const load = lazyImport(() => import("this-module-does-not-exist"));

    await assert.rejects(load());
  });
});
