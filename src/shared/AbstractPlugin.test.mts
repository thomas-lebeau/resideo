import { describe, mock, test } from "node:test";
import assert from "node:assert/strict";

import { AbstractPlugin } from "./AbstractPlugin.mts";

let release: () => void = () => {};
let runs = 0;

class SlowPlugin extends AbstractPlugin {
  static readonly description = "Slow plugin";

  constructor() {
    super([]);
  }

  async run() {
    runs++;
    await new Promise<void>((resolve) => (release = resolve));

    return { type: "other", name: "slow" };
  }
}

class FailingPlugin extends AbstractPlugin {
  static readonly description = "Failing plugin";

  constructor() {
    super([]);
  }

  async run(): Promise<undefined> {
    throw new Error("boom");
  }
}

describe("AbstractPlugin.run", () => {
  test("skips a run while the previous one is in flight", async (t) => {
    const warnSpy = mock.method(console, "warn", () => {});
    const infoSpy = mock.method(console, "info", () => {});
    t.after(() => {
      warnSpy.mock.restore();
      infoSpy.mock.restore();
    });

    runs = 0;
    const first = new SlowPlugin().run();
    // A new instance per tick, as forEachPlugin does
    const second = await new SlowPlugin().run();

    assert.equal(second, undefined);
    assert.equal(runs, 1);
    assert.equal(warnSpy.mock.callCount(), 1);
    assert.match(
      String(warnSpy.mock.calls[0]?.arguments[0]),
      /still in progress/
    );

    release();
    assert.deepEqual(await first, { type: "other", name: "slow" });

    const third = new SlowPlugin().run();
    release();
    await third;

    assert.equal(runs, 2);
  });

  test("runs again after a failed run", async (t) => {
    const warnSpy = mock.method(console, "warn", () => {});
    const infoSpy = mock.method(console, "info", () => {});
    t.after(() => {
      warnSpy.mock.restore();
      infoSpy.mock.restore();
    });

    await assert.rejects(new FailingPlugin().run(), /boom/);
    await assert.rejects(new FailingPlugin().run(), /boom/);

    assert.equal(warnSpy.mock.callCount(), 0);
  });
});
