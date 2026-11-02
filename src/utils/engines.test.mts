import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import semver from "semver";

import packageJson from "../../package.json" with { type: "json" };

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const nvmrc = read(".nvmrc").trim();

test("the pinned dev Node version is consistent", async (t) => {
  await t.test(".nvmrc matches volta", () => {
    assert.equal(nvmrc, packageJson.volta.node);
  });

  await t.test(".nvmrc satisfies engines.node", () => {
    assert.ok(
      semver.satisfies(nvmrc, packageJson.engines.node),
      `${nvmrc} does not satisfy ${packageJson.engines.node}`,
    );
  });

  for (const workflow of ["test.yml", "release.yml"]) {
    await t.test(`${workflow} sets up Node ${nvmrc}`, () => {
      const versions = [...read(`.github/workflows/${workflow}`).matchAll(/node-version:\s*"([^"]+)"/g)].map(
        ([, version]) => version,
      );
      assert.ok(versions.length > 0);
      assert.deepEqual(new Set(versions), new Set([nvmrc]));
    });
  }
});
