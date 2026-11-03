import { describe, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Conf from "conf";

import { Store } from "./store.mts";

function createConf(t: TestContext) {
  const cwd = mkdtempSync(join(tmpdir(), "store-test-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));

  return new Conf({ projectName: "store-test", cwd });
}

describe("Store", () => {
  test("gets, sets and clears the value under its key", (t) => {
    const conf = createConf(t);
    const store = new Store<{ token: string }>("my-plugin", undefined, conf);

    assert.equal(store.get(), undefined);

    store.set({ token: "abc" });
    assert.deepEqual(store.get(), { token: "abc" });
    assert.deepEqual(conf.get("my-plugin"), { token: "abc" });

    store.clear();
    assert.equal(store.get(), undefined);
    assert.equal(conf.has("my-plugin"), false);
  });

  test("moves a value from the legacy key", (t) => {
    const conf = createConf(t);
    conf.set("MyPlugin", { token: "abc" });

    const store = new Store<{ token: string }>("my-plugin", "MyPlugin", conf);

    assert.deepEqual(store.get(), { token: "abc" });
    assert.equal(conf.has("MyPlugin"), false);
  });

  test("keeps the value under the key over the legacy one", (t) => {
    const conf = createConf(t);
    conf.set("my-plugin", { token: "new" });
    conf.set("MyPlugin", { token: "old" });

    const store = new Store<{ token: string }>("my-plugin", "MyPlugin", conf);

    assert.deepEqual(store.get(), { token: "new" });
    assert.deepEqual(conf.get("MyPlugin"), { token: "old" });
  });

  test("does nothing when there is no legacy value", (t) => {
    const conf = createConf(t);

    const store = new Store<{ token: string }>("my-plugin", "MyPlugin", conf);

    assert.equal(store.get(), undefined);
    assert.equal(conf.has("my-plugin"), false);
  });

  test("clears the legacy value too, so it is not moved back", (t) => {
    const conf = createConf(t);
    conf.set("my-plugin", { token: "new" });
    conf.set("MyPlugin", { token: "old" });

    new Store<{ token: string }>("my-plugin", "MyPlugin", conf).clear();

    assert.equal(conf.has("my-plugin"), false);
    assert.equal(conf.has("MyPlugin"), false);

    const store = new Store<{ token: string }>("my-plugin", "MyPlugin", conf);
    assert.equal(store.get(), undefined);
  });
});
