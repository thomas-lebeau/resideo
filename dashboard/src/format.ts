export interface Formatted {
  value: string;
  unit: string;
}

export type Format = (value: number) => Formatted;

const EMPTY: Formatted = { value: "—", unit: "" };

/** Non-breaking space: keeps "3.1 GB" or "1d 0h" on one line when tile text wraps. */
export const NBSP = " ";

const decimal = (digits: number) => (value: number) =>
  value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmt = {
  celsius: (v) => ({ value: decimal(1)(v), unit: "°C" }),
  percent: (v) => ({ value: decimal(0)(v), unit: "%" }),
  dbm: (v) => ({ value: decimal(0)(v), unit: "dBm" }),
  count: (v) => ({ value: decimal(0)(v), unit: "" }),
  bytes: (v) => scaled(v, 1024, ["B", "KB", "MB", "GB", "TB", "PB"]),
  byteRate: (v) => scaled(v, 1024, ["B/s", "KB/s", "MB/s", "GB/s"]),
  bitRate: (v) => scaled(v, 1000, ["bps", "Kbps", "Mbps", "Gbps"]),
  onOff: (v) => ({ value: v >= 0.5 ? "On" : "Off", unit: "" }),
  openClosed: (v) => ({ value: v >= 0.5 ? "Open" : "Closed", unit: "" }),
  upDown: (v) => ({ value: v >= 0.5 ? "Up" : "Down", unit: "" }),
  duration: (seconds) => {
    const s = Math.max(0, Math.floor(seconds));
    const d = Math.floor(s / 86_400);
    const h = Math.floor((s % 86_400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return { value: `${d}d${NBSP}${h}h`, unit: "" };
    if (h > 0) return { value: `${h}h${NBSP}${m}m`, unit: "" };
    return { value: `${m}m`, unit: "" };
  },
} satisfies Record<string, Format>;

function scaled(value: number, base: number, units: string[]): Formatted {
  let i = 0;
  let v = Math.abs(value);
  while (v >= base && i < units.length - 1) {
    v /= base;
    i++;
  }
  const digits = v >= 100 || i === 0 ? 0 : 1;
  return { value: decimal(digits)(Math.sign(value) * v), unit: units[i] };
}

export function format(value: number | null | undefined, f: Format): Formatted {
  return value === null || value === undefined || Number.isNaN(value) ? EMPTY : f(value);
}

export const formatText = (value: number | null | undefined, f: Format) => {
  const { value: v, unit } = format(value, f);
  return !unit ? v : unit === "%" ? `${v}%` : `${v}${NBSP}${unit}`;
};

export const formatTime = (ts: number, withDate = false) =>
  new Date(ts).toLocaleString(undefined, {
    ...(withDate && { month: "short", day: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
  });
