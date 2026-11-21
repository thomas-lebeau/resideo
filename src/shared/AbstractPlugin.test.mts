import { afterEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";

import datadog from "../utils/Datadog.mts";
import { AbstractPlugin } from "./AbstractPlugin.mts";

class PhilipsTV extends AbstractPlugin {
  constructor() {
    super([]);
  }

  async run() {
    return undefined;
  }
}

describe("AbstractPlugin.logger", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  test("sends logs under the plugin slug, like the plugin data", () => {
    mock.method(console, "warn", () => {});
    const sendSpy = mock.method(datadog, "send", () => {});

    new PhilipsTV().logger.warn("something went wrong");

    assert.equal(sendSpy.mock.callCount(), 1);
    assert.equal(sendSpy.mock.calls[0].arguments[0], "philips-tv");
    assert.equal(sendSpy.mock.calls[0].arguments[0], PhilipsTV.slug);
  });
});
