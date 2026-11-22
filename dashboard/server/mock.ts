import type { MockSpec, Point, QueryDef, Series } from "../src/queries.ts";
import { lastValue } from "../src/queries.ts";

/**
 * Generates plausible series so the dashboard runs without Datadog keys.
 * Values are a pure function of (query, group, timestamp), so refreshes look continuous.
 */
export function mockSeries(queries: readonly QueryDef[], times: number[]): Series[] {
  return queries.flatMap((def) => {
    const groups = def.groupBy && def.mock.groups ? def.mock.groups : [undefined];
    return groups.map((groupValue) => {
      const seed = hash(`${def.id}:${groupValue ?? ""}`);
      const points: Point[] = times.map((t) => [t, mockValue(def.mock, seed, t)]);
      return {
        queryId: def.id,
        group: def.groupBy && groupValue ? { [def.groupBy]: groupValue } : {},
        points,
        last: lastValue(points),
      };
    });
  });
}

function mockValue({ min, max, binary, counter, integer, spiky }: MockSpec, seed: number, t: number): number {
  const hours = t / 3_600_000;
  if (spiky) {
    // ~1 bucket in 25 gets a spike.
    const roll = hash(`${seed}:${Math.floor(t / 60_000)}`) % 100;
    return roll < 4 ? min + 1 + (roll % Math.max(1, max - min)) : min;
  }
  if (binary) {
    if (min === max) return min;
    // Flip state in ~45 min blocks, with a per-series phase.
    return hash(`${seed}:${Math.floor(hours * 1.3 + (seed % 7))}`) % 3 === 0 ? 1 : 0;
  }
  if (counter) {
    // Grows from min, wrapping at max so the numbers stay in range (keep max - min large so the
    // wrap rarely lands inside the visible range).
    return min + ((Math.floor(t / 1000) + seed) % (max - min));
  }
  const phase = (seed % 1000) / 159;
  const wave = (Math.sin(hours / 3 + phase) + 1) / 2; // slow daily-ish swing, 0..1
  const jitter = ((hash(`${seed}:${Math.floor(t / 60_000)}`) % 1000) / 1000 - 0.5) * 0.08;
  const value = min + (max - min) * Math.min(1, Math.max(0, wave + jitter));
  return integer ? Math.round(value) : Math.round(value * 10) / 10;
}

/** FNV-1a: small, deterministic string hash. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
