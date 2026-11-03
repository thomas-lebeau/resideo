import { useEffect, useState } from "react";
import type { RangeId, SectionId, SectionResponse } from "../queries.ts";

const REFRESH_MS = 60_000;

export interface SectionState {
  data?: SectionResponse;
  /** Set when the last refresh failed; `data` keeps the last good response. */
  error?: string;
  loading: boolean;
}

/** Loads a section, refreshes it every minute while the tab is visible. */
export function useSection(section: SectionId, range: RangeId): SectionState {
  const [state, setState] = useState<SectionState>({ loading: true });

  useEffect(() => {
    let controller: AbortController | undefined;
    let lastLoad = 0;

    const load = async () => {
      controller?.abort();
      const current = (controller = new AbortController());
      lastLoad = Date.now();
      setState((s) => ({ ...s, loading: true }));
      try {
        const response = await fetch(`/api/query?section=${section}&range=${range}`, { signal: current.signal });
        if (!response.ok) {
          // The error body is optional detail; fall back to the status.
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? `HTTP ${response.status}`);
        }
        // A success body that fails to read (or is aborted mid-read) must not replace good data.
        const data = (await response.json()) as SectionResponse;
        // A newer load (range change) or cleanup may have cancelled this one while reading.
        if (current.signal.aborted) return;
        setState({ data, loading: false });
      } catch (error) {
        if (current.signal.aborted) return;
        setState((s) => ({ ...s, loading: false, error: error instanceof Error ? error.message : String(error) }));
      }
    };

    const isVisible = () => document.visibilityState === "visible";
    const onVisibilityChange = () => {
      if (isVisible() && Date.now() - lastLoad >= REFRESH_MS) void load();
    };
    const timer = setInterval(() => isVisible() && void load(), REFRESH_MS);

    void load();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      controller?.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [section, range]);

  return state;
}
