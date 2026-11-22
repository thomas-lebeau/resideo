import { useEffect, useRef, useState } from "react";
import { formatText } from "../format.ts";
import { useSection } from "../hooks/useSection.ts";
import type { RangeId, SectionResponse } from "../queries.ts";
import { RANGES, isRangeId } from "../queries.ts";
import { seriesOf } from "../series.ts";
import type { ChartSpec, TileModel } from "../tiles.ts";
import { Chart } from "./Chart.tsx";
import { Icon } from "./icons.tsx";
import { TileIcon } from "./Tile.tsx";

const RANGE_KEY = "dashboard:sheet-range";

function storedRange(): RangeId {
  try {
    const stored = localStorage.getItem(RANGE_KEY);
    if (isRangeId(stored)) return stored;
  } catch {
    // storage unavailable (private mode)
  }
  return "24h";
}

/**
 * Modal with a tile's history. A bottom sheet on phones, a centered panel on wider screens.
 * Uses <dialog> for focus trapping, Esc to close and the backdrop.
 */
export function DetailSheet({ tile, onClose }: { tile: TileModel | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (tile && !el.open) el.showModal();
    if (!tile && el.open) el.close();
  }, [tile]);

  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-labelledby="sheet-title"
      onClose={onClose}
      // A click on the dialog element itself (not its content) is a click on the backdrop.
      onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
    >
      {tile && <SheetContent tile={tile} onClose={() => dialog.current?.close()} />}
    </dialog>
  );
}

function SheetContent({ tile, onClose }: { tile: TileModel; onClose: () => void }) {
  const [range, setRange] = useState<RangeId>(storedRange);
  const { data, error } = useSection(tile.section, range);

  const selectRange = (next: RangeId) => {
    setRange(next);
    try {
      localStorage.setItem(RANGE_KEY, next);
    } catch {
      // ignore
    }
  };

  return (
    <div className={`sheet__content${tile.accent ? ` accent-${tile.accent}` : ""}`}>
      <div className="sheet__grabber" aria-hidden="true" />
      <header className="sheet__header">
        <span className={`sheet__icon${tile.active ? " tile--active" : ""}`}>
          <TileIcon tile={tile} />
        </span>
        <div className="sheet__heading">
          <h2 id="sheet-title">{tile.title}</h2>
          <p className={tile.tone ? `tone-${tile.tone}` : undefined}>{tile.status}</p>
        </div>
        <button type="button" className="sheet__close" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
      </header>

      <div className="segmented" role="group" aria-label="Time range">
        {(Object.keys(RANGES) as RangeId[]).map((id) => (
          <button key={id} type="button" aria-pressed={id === range} onClick={() => selectRange(id)}>
            {RANGES[id].label}
          </button>
        ))}
      </div>

      {error && <p className="banner">Couldn't load history: {error}</p>}
      <div className="sheet__charts" aria-busy={!data || data.range !== range}>
        {tile.charts.map((spec) => (
          <ChartCard key={`${spec.queryId}:${spec.group ?? ""}`} spec={spec} data={data?.range === range ? data : undefined} />
        ))}
      </div>
    </div>
  );
}

function ChartCard({ spec, data }: { spec: ChartSpec; data: SectionResponse | undefined }) {
  const series = data && seriesOf(data, spec.queryId).find((s) => !spec.group || s.group.name === spec.group);
  const values = series?.points.flatMap(([, v]) => (v === null ? [] : [v])) ?? [];
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

  return (
    <section className="chart-card">
      <header className="chart-card__header">
        <h3>{spec.label}</h3>
        <span className="chart-card__value">{formatText(series?.last, spec.format)}</span>
      </header>
      {!data ? (
        <div className="chart-card__loading" aria-hidden="true" />
      ) : series ? (
        <>
          <Chart points={series.points} format={spec.format} label={spec.label} step={spec.step} withDate={data.range === "7d"} />
          {!spec.step && values.length > 0 && (
            <dl className="chart-card__stats">
              <div>
                <dt>Min</dt>
                <dd>{formatText(Math.min(...values), spec.format)}</dd>
              </div>
              <div>
                <dt>Avg</dt>
                <dd>{formatText(avg, spec.format)}</dd>
              </div>
              <div>
                <dt>Max</dt>
                <dd>{formatText(Math.max(...values), spec.format)}</dd>
              </div>
            </dl>
          )}
        </>
      ) : (
        <p className="chart__empty">No data in this range</p>
      )}
    </section>
  );
}
