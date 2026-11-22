import { useState } from "react";
import { Chips } from "./components/Chips.tsx";
import { DetailSheet } from "./components/DetailSheet.tsx";
import { Tile, TileSkeleton } from "./components/Tile.tsx";
import { formatTime } from "./format.ts";
import { useSection } from "./hooks/useSection.ts";
import type { TileModel } from "./tiles.ts";
import { buildCategories, buildChips } from "./tiles.ts";

export function App() {
  // Current values: the last hour is enough for every tile (errors are counted over it).
  const climate = useSection("climate", "1h");
  const network = useSection("network", "1h");
  const devices = useSection("devices", "1h");
  const health = useSection("health", "1h");
  const states = [climate, network, devices, health];

  const data = { climate: climate.data, network: network.data, devices: devices.data, health: health.data };
  const categories = buildCategories(data);
  const chips = buildChips(data, categories);

  // Keep the key, not the tile, so an open sheet shows refreshed values.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = categories.flatMap((c) => c.tiles ?? []).find((t) => t.key === selectedKey) ?? null;
  const open = (tile: TileModel) => setSelectedKey(tile.key);

  const loaded = states.flatMap((s) => (s.data ? [s.data] : []));
  const updatedAt = loaded.length ? Math.max(...loaded.map((d) => d.to)) : null;
  const errors = states.flatMap((s) => (s.error ? [s.error] : []));

  return (
    <>
      <header className="home-header">
        <h1>My Home</h1>
        <p className="home-header__meta">
          {loaded.some((d) => d.mock) && <span className="tag">Mock data</span>}
          {updatedAt && `Updated ${formatTime(updatedAt)}`}
        </p>
      </header>

      <Chips chips={chips} />

      <main>
        {errors.length > 0 && (
          <p className="banner" role="status">
            Some data couldn't refresh: {[...new Set(errors)].join("; ")}
          </p>
        )}
        {categories.map((category) => (
          <section key={category.id} id={category.id} className="category" aria-labelledby={`${category.id}-title`}>
            <h2 id={`${category.id}-title`}>{category.title}</h2>
            {category.tiles?.length === 0 ? (
              <p className="category__empty">{category.empty}</p>
            ) : (
              <div className="tiles">
                {category.tiles
                  ? category.tiles.map((tile) => <Tile key={tile.key} tile={tile} onOpen={open} />)
                  : [0, 1].map((i) => <TileSkeleton key={i} />)}
              </div>
            )}
          </section>
        ))}
      </main>

      <DetailSheet tile={selected} onClose={() => setSelectedKey(null)} />
    </>
  );
}
