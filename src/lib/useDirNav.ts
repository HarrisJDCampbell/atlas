import { useCallback, useEffect, useState } from "react";
import { api, DirScan } from "../api";

/** Folder navigation for a world: which folder we're in, its scan, and Esc to go up. */
export function useDirNav(floor: string | null = null) {
  const [path, setPath] = useState<string | null>(floor);
  const [scan, setScan] = useState<DirScan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) { setScan(null); return; }
    setError(null);
    api.dirScan(path).then(setScan).catch((e) => setError(String(e)));
  }, [path]);

  /** Up one level; above the floor (or the project root) leaves the folder view. */
  const up = useCallback(() => {
    if (!path || path === floor) return;
    const crumbs = scan?.crumbs ?? [];
    setPath(crumbs.length > 1 ? crumbs[crumbs.length - 2][1] : floor);
  }, [path, scan, floor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "Escape" && !(t && ["INPUT", "TEXTAREA"].includes(t.tagName))) up();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [up]);

  return { path, setPath, scan, error, up };
}
