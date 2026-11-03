import type { SectionResponse, Series } from "./queries.ts";

/** All series of a query (one per group for grouped queries). */
export const seriesOf = (data: SectionResponse, queryId: string): Series[] =>
  data.series.filter((s) => s.queryId === queryId);

/** The single series of an ungrouped query. */
export const single = (data: SectionResponse, queryId: string): Series | undefined => seriesOf(data, queryId)[0];

/** Series of a grouped query keyed by their `name` tag. */
export const byName = (data: SectionResponse, queryId: string): Map<string, Series> =>
  new Map(seriesOf(data, queryId).map((s) => [s.group.name ?? "Unknown", s]));

/** Sum of all values in the range, e.g. total errors from an `.as_count()` query. */
export const total = (series: Series | undefined): number | null =>
  series ? series.points.reduce((sum, [, v]) => sum + (v ?? 0), 0) : null;

export const isOn = (value: number | null | undefined) => value !== null && value !== undefined && value >= 0.5;

export const byLabel = (a: string, b: string) => a.localeCompare(b);
