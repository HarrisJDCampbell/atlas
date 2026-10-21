import { useEffect, useMemo, useRef, useState } from "react";
import { AgentCfg, api } from "../api";
import { useData } from "../data";
import { fuzzy } from "../lib/fuzzy";
import { ModeId, MODES } from "../modes";
import { LauncherIcon, useLaunch } from "./launch";

interface Item {
  id: string;
  section: string;
  title: string;
  hint: string;
  keys?: string;
  icon?: React.ReactNode;
  run: () => void;
}

export default function Palette({ close, setMode, ask, openSettings }: {
  close: () => void;
  setMode: (m: ModeId) => void;
  ask: (agentId: string, text: string) => void;
  openSettings: () => void;
}) {
  const { launchers, projects, schedule } = useData();
  const { fire } = useLaunch();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [agents, setAgents] = useState<AgentCfg[]>([]);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => { api.config().then((c) => setAgents(c.config.agents)).catch(() => {}); }, []);

  const items: Item[] = useMemo(() => {
    const modeName = (id: string) => MODES.find((m) => m.id === id)?.name ?? id;
    const out: Item[] = [];
    for (const l of launchers.data ?? []) {
      out.push({
        id: `l:${l.id}`, section: "Launch", title: l.name,
        hint: `${modeName(l.mode)} · ${l.kind === "editor" ? "Open in Cursor" : l.group}`,
        keys: l.key, icon: <LauncherIcon l={l} size={22} />, run: () => fire(l),
      });
    }
    MODES.forEach((m, i) => out.push({
      id: `m:${m.id}`, section: "Modes", title: `${m.name} mode`, hint: m.blurb, keys: `⌘${i + 1}`,
      icon: <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.accent }} />, run: () => setMode(m.id),
    }));
    for (const c of schedule.data?.courses ?? []) {
      if (c.folder) out.push({ id: `c:${c.code}`, section: "Courses", title: `${c.code} folder`, hint: c.title, icon: <span className="text-ink-3">▱</span>, run: () => api.openCourseFolder(c.code) });
    }
    for (const p of projects.data ?? []) {
      out.push({ id: `p:${p.id}`, section: "Projects", title: p.name, hint: p.tagline, icon: <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.accent }} />, run: () => setMode("build") });
    }
    if (q.trim()) {
      for (const a of agents) {
        out.push({ id: `a:${a.id}`, section: "Ask", title: `Ask ${a.name}: “${q.trim()}”`, hint: a.model, icon: <span className="text-ink-3">✦</span>, run: () => ask(a.id, q.trim()) });
      }
    }
    out.push({ id: "x:settings", section: "Actions", title: "Settings", hint: "API keys, connections, config file", keys: "⌘,", icon: <span className="text-ink-3">⚙</span>, run: openSettings });
    return out;
  }, [launchers.data, projects.data, schedule.data, agents, q, fire, setMode, ask, openSettings]);

  const results = useMemo(() => {
    if (!q.trim()) return items.filter((i) => i.section !== "Ask");
    return items
      .map((i) => ({ i, s: i.section === "Ask" ? 0.5 : Math.max(fuzzy(q, i.title) ?? -1, (fuzzy(q, i.hint) ?? -1) - 2) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.i)
      .slice(0, 40);
  }, [items, q]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    list.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const run = (i: Item | undefined) => { if (!i) return; close(); i.run(); };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/55 pt-[12vh] backdrop-blur-sm" onMouseDown={close}>
      <div className="hud rise w-[640px] overflow-hidden shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <span className="text-accent">⌕</span>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} spellCheck={false}
            placeholder="Launch, jump, or ask an agent…"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); run(results[sel]); }
              else if (e.key === "Escape") close();
            }}
            className="selectable h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-4" />
          <span className="kbd">esc</span>
        </div>
        <div ref={list} className="max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 && <div className="px-3 py-8 text-center text-sm text-ink-3">Nothing matches.</div>}
          {results.map((r, i) => {
            const header = i === 0 || results[i - 1].section !== r.section;
            return (
              <div key={r.id}>
                {header && <div className="label px-3 pb-1 pt-3">{r.section}</div>}
                <button data-i={i} onMouseMove={() => setSel(i)} onClick={() => run(r)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${i === sel ? "bg-surface-3" : ""}`}>
                  <span className="flex w-6 justify-center">{r.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-ink">{r.title}</span>
                    <span className="block truncate text-[11px] text-ink-3">{r.hint}</span>
                  </span>
                  {r.keys && <span className="kbd">{r.keys}</span>}
                  {i === sel && <span className="text-[11px] text-ink-3">↵</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
