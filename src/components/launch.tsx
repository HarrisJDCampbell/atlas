import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, Launcher } from "../api";

interface Toast { id: number; text: string; error: boolean }
interface LaunchCtx {
  fire: (l: Launcher) => void;
  fired: string | null;
  notify: (text: string, error?: boolean) => void;
}

const Ctx = createContext<LaunchCtx | null>(null);

export function LaunchProvider({ children }: { children: ReactNode }) {
  const [fired, setFired] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const notify = useCallback((text: string, error = false) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, text, error }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), error ? 5000 : 1800);
  }, []);

  const fire = useCallback((l: Launcher) => {
    setFired(l.id);
    setTimeout(() => setFired((f) => (f === l.id ? null : f)), 520);
    api.launch(l.id).then(() => notify(`↗ ${l.name}`)).catch((e) => notify(String(e), true));
  }, [notify]);

  return (
    <Ctx.Provider value={{ fire, fired, notify }}>
      {children}
      <div className="pointer-events-none fixed bottom-10 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`rise rounded-full border px-4 py-1.5 text-xs shadow-xl backdrop-blur ${t.error ? "border-critical/50 bg-critical/15 text-ink" : "border-line-2 bg-surface-2/90 text-ink-2"}`}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useLaunch(): LaunchCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLaunch outside LaunchProvider");
  return v;
}

// Icons are cached by Rust on disk; this keeps one in-memory copy per session.
const iconCache = new Map<string, Promise<string | null>>();
export function useIcon(id: string): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!iconCache.has(id)) iconCache.set(id, api.icon(id).catch(() => null));
    iconCache.get(id)!.then((s) => live && setSrc(s));
    return () => { live = false; };
  }, [id]);
  return src;
}

const KIND_GLYPH: Record<string, string> = { folder: "▱", file: "▤", editor: "⌘", url: "↗", app: "◆" };

export function LauncherIcon({ l, size = 30 }: { l: Launcher; size?: number }) {
  const src = useIcon(l.id);
  if (src) return <img src={src} alt="" draggable={false} style={{ width: size, height: size }} className="shrink-0 rounded-[7px] object-contain" />;
  return (
    <div style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-[7px] border border-line-2 bg-surface-3 font-mono text-[11px] font-semibold text-ink-2">
      {l.kind === "folder" ? KIND_GLYPH.folder : l.name.slice(0, 2)}
    </div>
  );
}
