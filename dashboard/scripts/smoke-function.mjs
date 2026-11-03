// Smoke test for the built Vercel function (.vercel/output, from `vercel build`).
//
// Imports the emitted api/query function the way Vercel's Node runtime does and calls GET in mock
// mode. It catches build-output problems that unit tests can't see, such as emitted `.ts` import
// extensions that crash at runtime with ERR_MODULE_NOT_FOUND.
//
// Usage: node scripts/smoke-function.mjs [path/to/query.func]
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const funcDir = resolve(process.argv[2] ?? ".vercel/output/functions/api/query.func");
const entry = join(funcDir, "api/query.js");
if (!existsSync(entry)) fail(`built function not found at ${entry} (run \`vercel build\` first)`);

// Mock mode: never call Datadog from a smoke test, whatever the environment holds.
delete process.env.DD_API_KEY;
delete process.env.DD_APP_KEY;

const { GET } = await import(pathToFileURL(entry).href).catch((error) => fail(`importing the function failed: ${error.message}`));
if (typeof GET !== "function") fail("the function does not export GET");

const ok = await GET(new Request("https://dashboard.test/api/query?section=climate&range=1h"));
const body = await ok.json();
if (ok.status !== 200 || body.mock !== true || !Array.isArray(body.series) || body.series.length === 0) {
  fail(`unexpected response: ${ok.status} ${JSON.stringify(body).slice(0, 200)}`);
}

const bad = await GET(new Request("https://dashboard.test/api/query?section=nope"));
if (bad.status !== 400) fail(`expected 400 for an unknown section, got ${bad.status}`);

console.log(`✓ built function OK: ${body.series.length} mock series, unknown section → 400`);

function fail(message) {
  console.error(`✗ smoke test failed: ${message}`);
  process.exit(1);
}
