import type { TileModel } from "../tiles.ts";
import { Icon } from "./icons.tsx";

/** The round icon slot: a glyph, or a short value like `19°` for sensors. */
export function TileIcon({ tile }: { tile: TileModel }) {
  return (
    <span className="tile__icon">
      {tile.iconText ? (
        <span className={`tile__icon-text${tile.iconText.length > 3 ? " tile__icon-text--long" : ""}`}>{tile.iconText}</span>
      ) : (
        <Icon name={tile.icon} />
      )}
    </span>
  );
}

export function Tile({ tile, onOpen }: { tile: TileModel; onOpen: (tile: TileModel) => void }) {
  const classes = ["tile", tile.active && "tile--active", tile.accent && `accent-${tile.accent}`, tile.tone && `tone-${tile.tone}`];
  return (
    <button type="button" className={classes.filter(Boolean).join(" ")} onClick={() => onOpen(tile)}>
      <TileIcon tile={tile} />
      <span className="tile__text">
        <span className="tile__title">{tile.title}</span>
        <span className="tile__status">{tile.status}</span>
      </span>
      {tile.tone && (
        <span className="tile__badge" aria-hidden="true">
          !
        </span>
      )}
    </button>
  );
}

export function TileSkeleton() {
  return <div className="tile tile--skeleton" aria-hidden="true" />;
}
