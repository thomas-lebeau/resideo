import { describe, expect, it, vi } from "vitest";
import { SECTIONS } from "../src/queries.ts";
import type { SectionResponse } from "../src/queries.ts";
import { handleQuery, normalize } from "./query.ts";

const NOW = Date.UTC(2026, 10, 3, 12, 0, 0);
const KEYS = { DD_API_KEY: "api", DD_APP_KEY: "app" };
const get = (query: string) => new Request(`http://localhost/api/query?${query}`);

describe("handleQuery", () => {
  it("rejects unknown sections and ranges", async () => {
    expect((await handleQuery(get("section=bogus"), {})).status).toBe(400);
    expect((await handleQuery(get("section=__proto__"), {})).status).toBe(400);
    expect((await handleQuery(get("section=climate&range=1y"), {})).status).toBe(400);
  });

  it("rejects non-GET requests", async () => {
    const request = new Request("http://localhost/api/query?section=climate", { method: "POST" });
    expect((await handleQuery(request, {})).status).toBe(405);
  });

  it("returns mock data when Datadog keys are missing", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    const response = await handleQuery(get("section=climate&range=1h"), { DD_API_KEY: "api" }, { fetch: fetchSpy, now: NOW });
    const body = (await response.json()) as SectionResponse;

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(body).toMatchObject({ section: "climate", range: "1h", mock: true, from: NOW - 3_600_000, to: NOW });
    const temperatures = body.series.filter((s) => s.queryId === "temperature");
    expect(temperatures.map((s) => s.group.name)).toEqual(["Living Room", "Bedroom", "Server Room"]);
    expect(temperatures[0].points).toHaveLength(61);
    expect(temperatures[0].last).toBeTypeOf("number");
    // every query of the section has at least one series
    for (const def of SECTIONS.climate.queries) {
      expect(body.series.some((s) => s.queryId === def.id)).toBe(true);
    }
  });

  it("queries Datadog with one request per section and normalizes the response", async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () =>
      Response.json({
        data: {
          attributes: {
            series: [
              { group_tags: ["name:Bedroom"], query_index: 0 },
              { group_tags: ["*"], query_index: 2 },
            ],
            times: [1000, 2000],
            values: [
              [20.5, null],
              [19, 19.5],
            ],
          },
        },
      }),
    );
    const response = await handleQuery(
      get("section=climate&range=24h"),
      { ...KEYS, DD_SITE: "datadoghq.eu", DD_QUERY_SCOPE: "env:production" },
      { fetch: fetchSpy, now: NOW },
    );
    const body = (await response.json()) as SectionResponse;

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.datadoghq.eu/api/v2/query/timeseries");
    expect(init?.headers).toMatchObject({ "DD-API-KEY": "api", "DD-APPLICATION-KEY": "app" });
    const { attributes } = JSON.parse(init?.body as string).data;
    expect(attributes).toMatchObject({ from: NOW - 86_400_000, to: NOW, interval: 600_000 });
    expect(attributes.queries[0]).toEqual({
      data_source: "metrics",
      name: "q0",
      query: "avg:raspberry_home_monitor.temperature{env:production} by {name}",
    });
    expect(attributes.formulas).toHaveLength(SECTIONS.climate.queries.length);

    expect(body.mock).toBe(false);
    expect(body.series).toEqual([
      { queryId: "temperature", group: { name: "Bedroom" }, points: [[1000, 20.5], [2000, null]], last: 20.5 },
      { queryId: "thermostat_target", group: {}, points: [[1000, 19], [2000, 19.5]], last: 19.5 },
    ]);
  });

  it("returns 502 with Datadog's error message when the API fails", async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () => Response.json({ errors: ["Forbidden"] }, { status: 403 }));
    const response = await handleQuery(get("section=health"), KEYS, { fetch: fetchSpy, now: NOW });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Datadog API responded 403: Forbidden" });
  });
});

describe("normalize", () => {
  it("ignores series with an unknown query index and tolerates empty responses", () => {
    expect(normalize(SECTIONS.health.queries, {})).toEqual([]);
    expect(
      normalize(SECTIONS.health.queries, { data: { attributes: { series: [{ query_index: 99 }], times: [1], values: [[1]] } } }),
    ).toEqual([]);
  });
});
