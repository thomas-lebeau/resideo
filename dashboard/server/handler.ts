/**
 * GET /api/query?section=<id>&range=<1h|24h|7d>
 *
 * Runs the queries of one dashboard section against the Datadog API and returns normalized series.
 * Uses only Web-standard Request/Response/fetch so the same handler can be mounted by the Vite dev
 * server, a Cloudflare Worker or a Vercel function. Datadog keys stay server-side.
 */
import type { Point, QueryDef, SectionResponse, Series } from "../src/queries.ts";
import { RANGES, SECTIONS, buildQuery, isRangeId, isSectionId, lastValue } from "../src/queries.ts";
import { mockSeries } from "./mock.ts";

export interface Env {
  DD_API_KEY?: string;
  DD_APP_KEY?: string;
  /** Datadog site, e.g. datadoghq.com or datadoghq.eu. */
  DD_SITE?: string;
  /** Tag scope applied to every query, e.g. `env:production`. Defaults to `*`. */
  DD_QUERY_SCOPE?: string;
}

export interface HandlerOptions {
  fetch?: typeof fetch;
  now?: number;
}

const DATADOG_TIMEOUT_MS = 10_000;

/**
 * Real data is cached by the CDN (Vercel's edge, per section+range URL) for a minute, the
 * metrics' resolution, and served stale for another minute while it refreshes. However much the
 * public endpoint is called, Datadog sees about one query per minute per URL. Mock data and errors
 * are never cached.
 */
export const CACHE_REAL_DATA = "public, s-maxage=60, stale-while-revalidate=60";
const NO_STORE = "no-store";

export async function handleQuery(
  request: Request,
  env: Env,
  { fetch: fetchImpl = fetch, now = Date.now() }: HandlerOptions = {},
): Promise<Response> {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const params = new URL(request.url).searchParams;
  const section = params.get("section");
  const range = params.get("range") ?? "1h";
  if (!isSectionId(section)) return json({ error: `Unknown section: ${section}` }, 400);
  if (!isRangeId(range)) return json({ error: `Unknown range: ${range}` }, 400);

  const { durationMs, intervalMs } = RANGES[range];
  const to = now;
  const from = now - durationMs;
  const queries = SECTIONS[section].queries;
  const base = { section, range, from, to };

  if (!env.DD_API_KEY || !env.DD_APP_KEY) {
    return json({ ...base, mock: true, series: mockSeries(queries, bucketTimes(from, to, intervalMs)) } satisfies SectionResponse);
  }

  try {
    const series = await queryDatadog(queries, { from, to, intervalMs, env, fetchImpl });
    return json({ ...base, mock: false, series } satisfies SectionResponse, 200, CACHE_REAL_DATA);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
}

interface DatadogTimeseriesResponse {
  data?: {
    attributes?: {
      series?: { group_tags?: string[]; query_index?: number }[];
      times?: number[];
      values?: (number | null)[][];
    };
  };
  errors?: string | string[];
}

async function queryDatadog(
  queries: readonly QueryDef[],
  { from, to, intervalMs, env, fetchImpl }: { from: number; to: number; intervalMs: number; env: Env; fetchImpl: typeof fetch },
): Promise<Series[]> {
  const scope = env.DD_QUERY_SCOPE || "*";
  const response = await fetchImpl(`https://api.${env.DD_SITE || "datadoghq.com"}/api/v2/query/timeseries`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "DD-API-KEY": env.DD_API_KEY!,
      "DD-APPLICATION-KEY": env.DD_APP_KEY!,
    },
    body: JSON.stringify({
      data: {
        type: "timeseries_request",
        attributes: {
          from,
          to,
          interval: intervalMs,
          queries: queries.map((def, i) => ({ data_source: "metrics", name: `q${i}`, query: buildQuery(def, scope) })),
          formulas: queries.map((_, i) => ({ formula: `q${i}` })),
        },
      },
    }),
    signal: AbortSignal.timeout(DATADOG_TIMEOUT_MS),
  });

  if (!response.ok) {
    // An error body is optional detail: tolerate it being missing or invalid.
    const body = (await response.json().catch(() => ({}))) as DatadogTimeseriesResponse;
    const detail = [body.errors].flat().filter(Boolean).join("; ");
    throw new Error(`Datadog API responded ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  // A success body that can't be read (invalid JSON, timeout mid-body) is an error too: reading it
  // as "no data" would blank the tiles and make alerts look healthy instead of keeping the last
  // good data in the UI.
  return normalize(queries, (await response.json()) as DatadogTimeseriesResponse);
}

/** Turns Datadog's columnar response (shared `times`, one `values` row per series) into Series. */
export function normalize(queries: readonly QueryDef[], body: DatadogTimeseriesResponse): Series[] {
  const { series = [], times = [], values = [] } = body.data?.attributes ?? {};
  return series.flatMap((s, i) => {
    const def = queries[s.query_index ?? -1];
    if (!def) return [];
    const row = values[i] ?? [];
    const points: Point[] = times.map((t, j) => [t, row[j] ?? null]);
    return [{ queryId: def.id, group: parseTags(s.group_tags), points, last: lastValue(points) }];
  });
}

/** `["name:Living Room"]` → `{ name: "Living Room" }`. Skips tag-less entries such as `*`. */
function parseTags(tags: string[] = []): Record<string, string> {
  return Object.fromEntries(
    tags.flatMap((tag) => {
      const i = tag.indexOf(":");
      return i === -1 ? [] : [[tag.slice(0, i), tag.slice(i + 1)]];
    }),
  );
}

function bucketTimes(from: number, to: number, intervalMs: number): number[] {
  const times: number[] = [];
  for (let t = Math.ceil(from / intervalMs) * intervalMs; t <= to; t += intervalMs) times.push(t);
  return times;
}

function json(body: unknown, status = 200, cacheControl = NO_STORE): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": cacheControl },
  });
}
