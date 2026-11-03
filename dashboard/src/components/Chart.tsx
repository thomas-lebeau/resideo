import { useId, useState } from "react";
import type { PointerEvent } from "react";
import type { Format } from "../format.ts";
import { formatText, formatTime } from "../format.ts";
import type { Point } from "../queries.ts";

const W = 100;
const H = 40;
const PAD = 3;

interface Props {
  points: Point[];
  format: Format;
  label: string;
  /** Step line with a fixed 0..1 domain, for on/off states. */
  step?: boolean;
  /** Show dates in labels (ranges longer than a day). */
  withDate?: boolean;
}

/**
 * Single-series line chart with min/max and start/end labels and a crosshair tooltip on
 * hover/touch. Connects across empty buckets: some plugins report less often than the query
 * interval (e.g. the speed test runs every 10 minutes), so gaps are normal, not outages.
 */
export function Chart({ points, format, label, step = false, withDate = false }: Props) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const defined = points.filter((p): p is [number, number] => p[1] !== null);
  if (defined.length === 0) return <p className="chart__empty">No data in this range</p>;

  const t0 = points[0][0];
  const t1 = points[points.length - 1][0];
  const values = defined.map((p) => p[1]);
  let [min, max] = step ? [0, 1] : [Math.min(...values), Math.max(...values)];
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * W;
  const y = (v: number) => PAD + (1 - (v - min) / (max - min)) * (H - PAD * 2);

  let line = "";
  defined.forEach(([t, v], i) => {
    if (i === 0) line += `M${x(t).toFixed(2)},${y(v).toFixed(2)}`;
    else if (step) line += `H${x(t).toFixed(2)}V${y(v).toFixed(2)}`;
    else line += `L${x(t).toFixed(2)},${y(v).toFixed(2)}`;
  });
  const last = defined[defined.length - 1];
  if (step) line += `H${x(t1).toFixed(2)}`;
  const area = `${line}L${(step ? x(t1) : x(last[0])).toFixed(2)},${H}L${x(defined[0][0]).toFixed(2)},${H}Z`;

  const onPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const t = t0 + ((event.clientX - rect.left) / rect.width) * (t1 - t0);
    let nearest = 0;
    for (let i = 1; i < defined.length; i++) {
      if (Math.abs(defined[i][0] - t) < Math.abs(defined[nearest][0] - t)) nearest = i;
    }
    setHover(nearest);
  };

  const hovered = hover === null ? null : defined[hover];
  const hoverX = hovered ? (x(hovered[0]) / W) * 100 : 0;

  return (
    <figure className="chart">
      <div className="chart__y">
        <span>{formatText(max, format)}</span>
        <span>{formatText(min, format)}</span>
      </div>
      <div
        className="chart__plot"
        role="img"
        aria-label={`${label}, from ${formatText(values[0], format)} to ${formatText(last[1], format)}`}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" x2={W} y1={H - PAD} y2={H - PAD} className="chart__baseline" vectorEffect="non-scaling-stroke" />
          <path d={area} fill={`url(#${gradientId})`} />
          <path d={line} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        {hovered && (
          <>
            <div className="chart__crosshair" style={{ left: `${hoverX}%` }} />
            <div className="chart__dot" style={{ left: `${hoverX}%`, top: `${(y(hovered[1]) / H) * 100}%` }} />
            <div className={`chart__tooltip${hoverX > 60 ? " chart__tooltip--left" : ""}`} style={{ left: `${hoverX}%` }}>
              <strong>{formatText(hovered[1], format)}</strong>
              <span>{formatTime(hovered[0], withDate)}</span>
            </div>
          </>
        )}
      </div>
      <figcaption className="chart__x">
        <span>{formatTime(t0, withDate)}</span>
        <span>{formatTime(t1, withDate)}</span>
      </figcaption>
    </figure>
  );
}
