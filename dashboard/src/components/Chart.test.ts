import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fmt } from "../format.ts";
import type { Point } from "../queries.ts";
import { Chart, nextSampleIndex } from "./Chart.tsx";

describe("nextSampleIndex", () => {
  it("steps, pages and jumps within bounds", () => {
    expect(nextSampleIndex("ArrowLeft", 5, 50)).toBe(4);
    expect(nextSampleIndex("ArrowUp", 5, 50)).toBe(6);
    expect(nextSampleIndex("PageUp", 5, 50)).toBe(10);
    expect(nextSampleIndex("PageDown", 5, 50)).toBe(0);
    expect(nextSampleIndex("Home", 30, 50)).toBe(0);
    expect(nextSampleIndex("End", 3, 50)).toBe(49);
    expect(nextSampleIndex("ArrowRight", 49, 50)).toBe(49);
    expect(nextSampleIndex("PageUp", 0, 3)).toBe(1);
  });

  it("ignores other keys", () => {
    expect(nextSampleIndex("Tab", 3, 10)).toBeNull();
    expect(nextSampleIndex("a", 3, 10)).toBeNull();
  });
});

const render = (points: Point[], step = false) =>
  renderToStaticMarkup(createElement(Chart, { points, format: fmt.celsius, label: "Temperature", step }));

describe("Chart", () => {
  it("is a focusable slider announcing the latest sample", () => {
    const html = render([
      [Date.UTC(2026, 0, 1, 10, 0), 20],
      [Date.UTC(2026, 0, 1, 10, 1), null],
      [Date.UTC(2026, 0, 1, 10, 2), 21.5],
    ]);
    expect(html).toContain('role="slider"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-valuemax="1"');
    expect(html).toContain('aria-valuenow="1"');
    expect(html).toMatch(/aria-valuetext="21\.5 °C at [^"]+"/);
    expect(html).toContain("2 samples from 20.0");
  });

  it("marks a single sample with a dot instead of drawing nothing", () => {
    const points: Point[] = [
      [0, null],
      [60_000, 300e6],
      [120_000, null],
    ];
    expect(render(points)).toContain('class="chart__dot"');
    expect(render([...points, [180_000, 310e6]])).not.toContain('class="chart__dot"');
  });
});
