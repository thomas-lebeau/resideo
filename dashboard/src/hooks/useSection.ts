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
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`);
        setState({ data: body as SectionResponse, loading: false });
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
