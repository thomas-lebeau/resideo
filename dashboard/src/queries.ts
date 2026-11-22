/**
 * Dashboard sections and the Datadog queries behind them.
 *
 * Shared by the API handler (which only runs queries defined here, so it can't be used as an
 * open proxy to the Datadog org) and the UI (which renders the normalized series).
 * Metric names come from terraform/metrics.tf.
 */

export const METRIC_PREFIX = "raspberry_home_monitor";

export const RANGES = {
  "1h": { label: "1h", durationMs: 60 * 60_000, intervalMs: 60_000 },
  "24h": { label: "24h", durationMs: 24 * 60 * 60_000, intervalMs: 10 * 60_000 },
  "7d": { label: "7d", durationMs: 7 * 24 * 60 * 60_000, intervalMs: 60 * 60_000 },
} as const;

export type RangeId = keyof typeof RANGES;

export interface MockSpec {
  /** Tag values to generate one series per group (only for grouped queries). */
  groups?: string[];
  min: number;
  max: number;
  /** 0/1 values that flip from time to time. */
  binary?: boolean;
  /** Ever-increasing counter (e.g. total bytes), one unit per second. */
  counter?: boolean;
  /** Round to whole numbers (counts). */
  integer?: boolean;
  /** Mostly `min`, with occasional whole-number spikes up to `max` (e.g. error counts). */
  spiky?: boolean;
}

export interface QueryDef {
  id: string;
  metric: string;
  aggregator?: "avg" | "sum" | "max";
  groupBy?: string;
  /** Appended to the query, e.g. `.as_count()`. */
  suffix?: string;
  mock: MockSpec;
}

const ROOMS = ["Living Room", "Bedroom", "Server Room"];
const LIGHTS = ["Kitchen", "Living Room", "Hallway", "Desk Lamp"];
const SENSORS = ["Living Room", "Bedroom", "Hue Motion Sensor"];

export const SECTIONS = {
  climate: {
    title: "Climate",
    queries: [
      { id: "temperature", metric: "temperature", groupBy: "name", mock: { groups: ROOMS, min: 18, max: 24 } },
      { id: "humidity", metric: "humidity", groupBy: "name", mock: { groups: ROOMS, min: 40, max: 60 } },
      { id: "thermostat_target", metric: "thermostat.target_temperature", mock: { min: 19, max: 21 } },
      { id: "thermostat_state", metric: "thermostat.state", mock: { min: 0, max: 1, binary: true } },
      { id: "thermostat_heating", metric: "thermostat.operation_mode", mock: { min: 0, max: 1, binary: true } },
    ],
  },
  network: {
    title: "Network",
    queries: [
      { id: "internet_speed", metric: "internet.speed", mock: { min: 280e6, max: 520e6 } },
      { id: "wan_state", metric: "wan.state", mock: { min: 1, max: 1, binary: true } },
      { id: "wan_uptime", metric: "wan.uptime", mock: { min: 86_400, max: 90 * 86_400, counter: true } },
      { id: "wan_rx", metric: "wan.bytes_received", mock: { min: 4e11, max: 4.1e11, counter: true } },
      { id: "wan_tx", metric: "wan.bytes_sent", mock: { min: 6e10, max: 6.1e10, counter: true } },
    ],
  },
  devices: {
    title: "Devices",
    queries: [
      { id: "light_state", metric: "light.state", groupBy: "name", mock: { groups: LIGHTS, min: 0, max: 1, binary: true } },
      { id: "light_brightness", metric: "light.brightness", groupBy: "name", mock: { groups: LIGHTS, min: 20, max: 100 } },
      { id: "tv_state", metric: "tv.state", mock: { min: 0, max: 1, binary: true } },
      { id: "tv_volume", metric: "tv.volume", mock: { min: 10, max: 30 } },
      { id: "dishwasher_state", metric: "dishwasher.state", mock: { min: 0, max: 1, binary: true } },
      { id: "dishwasher_door", metric: "dishwasher.door_state", mock: { min: 0, max: 1, binary: true } },
      { id: "torrent_down", metric: "transmission.download_speed", mock: { min: 0, max: 8e6 } },
      { id: "torrent_up", metric: "transmission.upload_speed", mock: { min: 0, max: 1e6 } },
      { id: "torrent_active", metric: "transmission.active_torrent_count", mock: { min: 0, max: 4, integer: true } },
    ],
  },
  health: {
    title: "System health",
    queries: [
      { id: "uptime", metric: "home_monitor.uptime", mock: { min: 3600, max: 90 * 86_400, counter: true } },
      { id: "errors", metric: "error.rate", aggregator: "sum", suffix: ".as_count()", mock: { min: 0, max: 3, spiky: true } },
      { id: "battery", metric: "battery_level", groupBy: "name", mock: { groups: SENSORS, min: 15, max: 100 } },
      { id: "rssi", metric: "rssi", groupBy: "name", mock: { groups: SENSORS, min: -85, max: -50 } },
    ],
  },
} as const satisfies Record<string, { title: string; queries: readonly QueryDef[] }>;

export type SectionId = keyof typeof SECTIONS;

export const isSectionId = (value: unknown): value is SectionId =>
  typeof value === "string" && Object.hasOwn(SECTIONS, value);

export const isRangeId = (value: unknown): value is RangeId =>
  typeof value === "string" && Object.hasOwn(RANGES, value);

/** Builds the Datadog query string, e.g. `avg:raspberry_home_monitor.temperature{env:prod} by {name}`. */
export function buildQuery(def: QueryDef, scope = "*"): string {
  const groupBy = def.groupBy ? ` by {${def.groupBy}}` : "";
  return `${def.aggregator ?? "avg"}:${METRIC_PREFIX}.${def.metric}{${scope}}${groupBy}${def.suffix ?? ""}`;
}

export type Point = [timestamp: number, value: number | null];

export interface Series {
  queryId: string;
  /** Tags of the group, e.g. `{ name: "Bedroom" }`. Empty for ungrouped queries. */
  group: Record<string, string>;
  points: Point[];
  /** Most recent non-null value. */
  last: number | null;
}

export interface SectionResponse {
  section: SectionId;
  range: RangeId;
  from: number;
  to: number;
  /** True when the server has no Datadog keys and returns generated data. */
  mock: boolean;
  series: Series[];
}

export function lastValue(points: Point[]): number | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const value = points[i][1];
    if (value !== null) return value;
  }
  return null;
}
