import { test } from "node:test";
import assert from "node:assert/strict";

import { toKebabCase } from "./toKebabCase.mts";

test("toKebabCase", async (t) => {
  const cases: Array<[input: string, expected: string]> = [
    ["PhilipsHue", "philips-hue"],
    ["camelCase", "camel-case"],
    ["HTTPServer", "http-server"],
    ["Auto1", "auto1"],
    ["Intensiv70", "intensiv70"],
    ["AutoHalfLoad", "auto-half-load"],
    ["  Thermo Beacon  ", "thermo-beacon"],
    ["already-kebab", "already-kebab"],
  ];

  for (const [input, expected] of cases) {
    await t.test(JSON.stringify(input), () => {
      assert.equal(toKebabCase(input), expected);
    });
  }
});
