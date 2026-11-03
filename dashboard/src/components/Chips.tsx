import type { Chip } from "../tiles.ts";
import { Icon } from "./icons.tsx";

/** Summary pills under the title; each links to its category. */
export function Chips({ chips }: { chips: Chip[] }) {
  return (
    <nav className="chips" aria-label="Summary">
      {chips.map((chip) => (
        <a key={chip.label} href={`#${chip.id}`} className={`chip${chip.tone ? ` tone-${chip.tone}` : ""}`}>
          <span className="chip__icon">
            <Icon name={chip.icon} size={18} />
          </span>
          <span className="chip__text">
            <span className="chip__label">{chip.label}</span>
            <span className="chip__value">{chip.value}</span>
          </span>
        </a>
      ))}
    </nav>
  );
}
