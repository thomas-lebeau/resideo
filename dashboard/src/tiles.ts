/**
 * Maps section responses to what the home screen shows: summary chips, categories and tiles.
 * Pure functions, so the display logic is unit-tested without rendering.
 */
import type { Format } from "./format.ts";
import { NBSP, fmt, format, formatText } from "./format.ts";
import type { SectionId, SectionResponse, Series } from "./queries.ts";
import { byLabel, byName, isOn, single, total } from "./series.ts";

export type IconName =
  | "thermometer"
  | "flame"
  | "bulb"
  | "tv"
  | "dishwasher"
  | "download"
  | "globe"
  | "router"
  | "arrows"
  | "cpu"
  | "alert"
  | "battery"
  | "signal";

/** Color of an active tile's icon. */
export type Accent = "amber" | "orange" | "blue" | "green";
export type Tone = "warning" | "critical";

export interface ChartSpec {
  queryId: string;
  /** `name` tag of the series, for grouped queries. */
  group?: string;
  label: string;
  format: Format;
  /** Draw as a step line with a fixed 0..1 domain (on/off states). */
  step?: boolean;
}

export interface TileModel {
  key: string;
  icon: IconName;
  /** Short value shown in place of the icon, e.g. `19°`. */
  iconText?: string;
  title: string;
  status: string;
  active: boolean;
  accent?: Accent;
  tone?: Tone;
  section: SectionId;
  charts: ChartSpec[];
}

export interface Category {
  id: string;
  title: string;
  section: SectionId;
  /** `null` while the section hasn't loaded yet. */
  tiles: TileModel[] | null;
  empty: string;
}

export interface Chip {
  id: string;
  icon: IconName;
  label: string;
  value: string;
  tone?: Tone;
}

export type DashboardData = Partial<Record<SectionId, SectionResponse>>;

const LOW_BATTERY = 30;
const CRITICAL_BATTERY = 15;
const WEAK_SIGNAL = -75;

/**
 * Datadog normalizes tag values (lowercase, spaces → underscores), so `Living Room` comes back as
 * `living_room`. Turn it back into a readable label. Series are still matched on the raw tag.
 */
export const displayName = (tag: string) => tag.replace(/_/g, " ").replace(/(^|\s)\p{Ll}/gu, (c) => c.toUpperCase());

const byDisplayName = (a: string, b: string) => byLabel(displayName(a), displayName(b));

const degrees = (value: number | null | undefined, digits = 1) =>
  value == null ? "—" : `${value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })}°`;

const text = (value: number | null | undefined, f: Format) => formatText(value, f);
const compact = (value: number | null | undefined, f: Format) => {
  const { value: v, unit } = format(value, f);
  return `${v}${unit}`;
};

function climate(data: SectionResponse): TileModel[] {
  const temperatures = byName(data, "temperature");
  const humidities = byName(data, "humidity");
  const rooms = [...new Set([...temperatures.keys(), ...humidities.keys()])].sort(byDisplayName);

  const roomTiles = rooms.map((room): TileModel => {
    const temperature = temperatures.get(room)?.last;
    const humidity = humidities.get(room)?.last;
    return {
      key: `room:${room}`,
      icon: "thermometer",
      ...(temperature != null && { iconText: degrees(temperature, 0) }),
      title: displayName(room),
      status: [degrees(temperature), humidity != null && text(humidity, fmt.percent)].filter(Boolean).join(" · "),
      active: false,
      section: "climate",
      charts: [
        { queryId: "temperature", group: room, label: "Temperature", format: fmt.celsius },
        { queryId: "humidity", group: room, label: "Humidity", format: fmt.percent },
      ],
    };
  });

  const target = single(data, "thermostat_target")?.last;
  const mode = single(data, "thermostat_state")?.last;
  const heating = isOn(single(data, "thermostat_heating")?.last);
  const thermostat: TileModel = {
    key: "thermostat",
    icon: "flame",
    ...(target != null && { iconText: degrees(target, 0) }),
    title: "Thermostat",
    status: mode == null ? "No data" : !isOn(mode) ? "Off" : heating ? `Heating to ${degrees(target)}` : `Heat · Idle`,
    active: heating,
    accent: "orange",
    section: "climate",
    charts: [
      { queryId: "thermostat_target", label: "Target temperature", format: fmt.celsius },
      { queryId: "thermostat_heating", label: "Heating", format: fmt.onOff, step: true },
      { queryId: "thermostat_state", label: "Heat mode", format: fmt.onOff, step: true },
    ],
  };

  return [...roomTiles, thermostat];
}

function lights(data: SectionResponse): TileModel[] {
  const brightness = byName(data, "light_brightness");
  return [...byName(data, "light_state").entries()]
    .map(([name, state]): TileModel => {
      const on = isOn(state.last);
      const level = brightness.get(name)?.last;
      return {
        key: `light:${name}`,
        icon: "bulb",
        title: displayName(name),
        status: on ? (level != null ? text(level, fmt.percent) : "On") : "Off",
        active: on,
        accent: "amber",
        section: "devices",
        charts: [
          { queryId: "light_state", group: name, label: "State", format: fmt.onOff, step: true },
          { queryId: "light_brightness", group: name, label: "Brightness", format: fmt.percent },
        ],
      };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || byLabel(a.title, b.title));
}

function appliances(data: SectionResponse): TileModel[] {
  const tvState = single(data, "tv_state")?.last;
  const tvOn = isOn(tvState);
  const volume = single(data, "tv_volume")?.last;

  const running = single(data, "dishwasher_state")?.last;
  const doorOpen = isOn(single(data, "dishwasher_door")?.last);

  const down = single(data, "torrent_down")?.last;
  const active = single(data, "torrent_active")?.last;

  return [
    {
      key: "tv",
      icon: "tv",
      title: "TV",
      status: tvState == null ? "No data" : tvOn ? (volume != null ? `On · Vol ${text(volume, fmt.count)}` : "On") : "Standby",
      active: tvOn,
      accent: "blue",
      section: "devices",
      charts: [
        { queryId: "tv_state", label: "Power", format: fmt.onOff, step: true },
        { queryId: "tv_volume", label: "Volume", format: fmt.count },
      ],
    },
    {
      key: "dishwasher",
      icon: "dishwasher",
      title: "Dishwasher",
      status: running == null ? "No data" : [isOn(running) ? "Running" : "Idle", doorOpen && "Door Open"].filter(Boolean).join(" · "),
      active: isOn(running),
      accent: "blue",
      ...(doorOpen && { tone: "warning" as const }),
      section: "devices",
      charts: [
        { queryId: "dishwasher_state", label: "Running", format: fmt.onOff, step: true },
        { queryId: "dishwasher_door", label: "Door", format: fmt.openClosed, step: true },
      ],
    },
    {
      key: "transmission",
      icon: "download",
      title: "Torrents",
      status: down == null && active == null ? "No data" : !active && !down ? "Idle" : `↓${NBSP}${text(down, fmt.byteRate)} · ${text(active, fmt.count)} active`,
      active: (active ?? 0) > 0 || (down ?? 0) > 0,
      accent: "green",
      section: "devices",
      charts: [
        { queryId: "torrent_down", label: "Download", format: fmt.byteRate },
        { queryId: "torrent_up", label: "Upload", format: fmt.byteRate },
        { queryId: "torrent_active", label: "Active torrents", format: fmt.count },
      ],
    },
  ];
}

function network(data: SectionResponse): TileModel[] {
  const wanState = single(data, "wan_state")?.last;
  const wanUp = isOn(wanState);
  return [
    {
      key: "internet",
      icon: "globe",
      title: "Internet",
      status: text(single(data, "internet_speed")?.last, fmt.bitRate),
      active: false,
      section: "network",
      charts: [{ queryId: "internet_speed", label: "Download speed", format: fmt.bitRate }],
    },
    {
      key: "wan",
      icon: "router",
      title: "Router",
      status: wanState == null ? "No data" : wanUp ? `Connected · ${text(single(data, "wan_uptime")?.last, fmt.duration)}` : "Down",
      active: false,
      ...(wanState != null && !wanUp && { tone: "critical" as const }),
      section: "network",
      charts: [
        { queryId: "wan_state", label: "Connection", format: fmt.upDown, step: true },
        { queryId: "wan_uptime", label: "Uptime", format: fmt.duration },
      ],
    },
    {
      key: "traffic",
      icon: "arrows",
      title: "Traffic",
      status: `↓${NBSP}${text(single(data, "wan_rx")?.last, fmt.bytes)}  ↑${NBSP}${text(single(data, "wan_tx")?.last, fmt.bytes)}`,
      active: false,
      section: "network",
      charts: [
        { queryId: "wan_rx", label: "Received", format: fmt.bytes },
        { queryId: "wan_tx", label: "Sent", format: fmt.bytes },
      ],
    },
  ];
}

/** Lowest (or highest) last value of a grouped query, with its group name. */
function extreme(series: Map<string, Series>, pick: "min" | "max") {
  let best: { name: string; value: number } | undefined;
  for (const [name, s] of series) {
    if (s.last == null) continue;
    if (!best || (pick === "min" ? s.last < best.value : s.last > best.value)) best = { name, value: s.last };
  }
  return best;
}

function system(data: SectionResponse): TileModel[] {
  const errors = Math.round(total(single(data, "errors")) ?? 0);
  const batteries = byName(data, "battery");
  const signals = byName(data, "rssi");
  const lowest = extreme(batteries, "min");
  const weakest = extreme(signals, "min");

  return [
    {
      key: "monitor",
      icon: "cpu",
      title: "Home Monitor",
      status: `Up ${text(single(data, "uptime")?.last, fmt.duration)}`,
      active: false,
      section: "health",
      charts: [{ queryId: "uptime", label: "Uptime", format: fmt.duration }],
    },
    {
      key: "errors",
      icon: "alert",
      title: "Errors",
      status: errors === 0 ? "None in last hour" : `${errors} in last hour`,
      active: false,
      ...(errors > 0 && { tone: "warning" as const }),
      section: "health",
      charts: [{ queryId: "errors", label: "Errors", format: fmt.count }],
    },
    {
      key: "batteries",
      icon: "battery",
      ...(lowest && { iconText: compact(lowest.value, fmt.percent) }),
      title: "Batteries",
      status: lowest ? `Lowest: ${displayName(lowest.name)}` : "No data",
      active: false,
      ...(lowest &&
        lowest.value < LOW_BATTERY && { tone: lowest.value < CRITICAL_BATTERY ? ("critical" as const) : ("warning" as const) }),
      section: "health",
      charts: [...batteries.keys()]
        .sort(byDisplayName)
        .map((name) => ({ queryId: "battery", group: name, label: displayName(name), format: fmt.percent })),
    },
    {
      key: "signal",
      icon: "signal",
      title: "Signal",
      status: weakest ? `${text(weakest.value, fmt.dbm)} · ${displayName(weakest.name)}` : "No data",
      active: false,
      ...(weakest && weakest.value < WEAK_SIGNAL && { tone: "warning" as const }),
      section: "health",
      charts: [...signals.keys()]
        .sort(byDisplayName)
        .map((name) => ({ queryId: "rssi", group: name, label: displayName(name), format: fmt.dbm })),
    },
  ];
}

const CATEGORIES: { id: string; title: string; section: SectionId; build: (d: SectionResponse) => TileModel[]; empty: string }[] = [
  { id: "climate", title: "Climate", section: "climate", build: climate, empty: "No sensors reporting" },
  { id: "lights", title: "Lights", section: "devices", build: lights, empty: "No lights reporting" },
  { id: "appliances", title: "Appliances", section: "devices", build: appliances, empty: "No appliances reporting" },
  { id: "network", title: "Network", section: "network", build: network, empty: "No network data" },
  { id: "system", title: "System", section: "health", build: system, empty: "No system data" },
];

export function buildCategories(data: DashboardData): Category[] {
  return CATEGORIES.map(({ build, ...category }) => {
    const section = data[category.section];
    return { ...category, tiles: section ? build(section) : null };
  });
}

export function buildChips(data: DashboardData, categories = buildCategories(data)): Chip[] {
  const chips: Chip[] = [];

  if (data.climate) {
    const temps = [...byName(data.climate, "temperature").values()].flatMap((s) => (s.last == null ? [] : [Math.round(s.last)]));
    const min = Math.min(...temps);
    const max = Math.max(...temps);
    chips.push({ id: "climate", icon: "thermometer", label: "Climate", value: temps.length === 0 ? "—" : min === max ? `${min}°` : `${min}–${max}°` });
  }

  if (data.devices) {
    const lightTiles = categories.find((c) => c.id === "lights")?.tiles ?? [];
    const on = lightTiles.filter((t) => t.active).length;
    chips.push({ id: "lights", icon: "bulb", label: "Lights", value: lightTiles.length === 0 ? "—" : on === 0 ? "All Off" : `${on} On` });
  }

  if (data.network) {
    chips.push({ id: "network", icon: "globe", label: "Internet", value: text(single(data.network, "internet_speed")?.last, fmt.bitRate) });
  }

  const alerts = categories.flatMap((c) => c.tiles ?? []).filter((t) => t.tone);
  const firstAlert = categories.find((c) => c.tiles?.some((t) => t.tone));
  chips.push({
    id: firstAlert?.id ?? "system",
    icon: "alert",
    label: "Alerts",
    value: alerts.length === 0 ? "None" : String(alerts.length),
    ...(alerts.length > 0 && { tone: alerts.some((t) => t.tone === "critical") ? ("critical" as const) : ("warning" as const) }),
  });

  return chips;
}
