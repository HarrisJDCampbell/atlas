import { useCallback, useEffect, useRef, useState } from "react";

export interface Polled<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  updatedAt: Date | null;
  refresh: () => void;
}

/** Runs `fn` now and every `everyMs`, keeping the last good data if a refresh fails. */
export function usePoll<T>(fn: () => Promise<T>, everyMs: number): Polled<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refresh = useCallback(() => {
    setLoading(true);
    fnRef
      .current()
      .then((d) => {
        setData(d);
        setError(null);
        setUpdatedAt(new Date());
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, everyMs);
    // Window regaining focus is when stale numbers are most noticeable.
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh, everyMs]);

  return { data, error, loading, updatedAt, refresh };
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Current time, re-rendering only the component that asks, every `everyMs`. */
export function useNow(everyMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
