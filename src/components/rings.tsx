// Shared pieces for concentric "worlds": every mode is a ring system with an
// agent at its centre, its data on the rings, its tools on the rim, and a drawer
// for the agent and the detail views.

import { createContext, ReactNode, useContext, useState } from "react";
import { AgentCfg, AgentProfile, Launcher } from "../api";
import { useData } from "../data";
import { arc, C, pt } from "../lib/polar";
import { AgentState, AvatarG } from "./Avatar";
import { useIcon, useLaunch } from "./launch";

export interface Hover { title: string; lines: string[]; color?: string; hint?: string }
export const HoverCtx = createContext<(h: Hover | null) => void>(() => {});
export const useHover = () => useContext(HoverCtx);

/** FNV-1a, same as Rust's stable_seed, so a character never changes face. */
export const seedOf = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
};

export const cfgProfile = (a: AgentCfg, accent: string): AgentProfile =>
  ({ id: `cfg:${a.id}`, name: a.name, role: "specialist", scope: "", model: a.model, seed: seedOf(a.id), accent });

/** Evenly spaced angles for n items across [start, start+span). */
export const around = (n: number, i: number, start = 0, span = 360) =>
  start + ((i + 0.5) * span) / Math.max(1, n);

export interface Tab { id: string; label: string; node: ReactNode }

export function World({ title, crumbs, children, tabs, tab, setTab }: {
  title: ReactNode; crumbs?: ReactNode; children: ReactNode;
  tabs: Tab[]; tab: string; setTab: (t: string) => void;
}) {
  const [hover, setHover] = useState<Hover | null>(null);
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];
  return (
    <HoverCtx.Provider value={setHover}>
      <div className="flex h-full gap-4">
        <div className="relative min-w-0 flex-1">
          <div className="absolute left-0 top-0 z-10 flex flex-wrap items-center gap-2">{crumbs ?? <span className="label">{title}</span>}</div>
          {hover && (
            <div className="rise absolute bottom-2 left-0 z-10 w-[300px]">
              <div className="label mb-2 flex items-center gap-2"><span className="h-px w-6 bg-accent" />Focus</div>
              <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
                {hover.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: hover.color, boxShadow: `0 0 8px ${hover.color}` }} />}
                <span className="truncate">{hover.title}</span>
              </div>
              {hover.lines.map((l, i) => <div key={i} className="truncate text-[12px] text-ink-2">{l}</div>)}
              {hover.hint && <div className="font-mono text-[10.5px] text-ink-4">{hover.hint}</div>}
            </div>
          )}
          <div className="zoom-in absolute inset-0 top-8 flex items-center justify-center">
            <div style={{ width: "min(100%, calc(100vh - 150px))", aspectRatio: "1" }}>
              <svg viewBox="0 0 1000 1000" className="h-full w-full overflow-visible select-none">{children}</svg>
            </div>
          </div>
        </div>
        <aside className="flex w-[430px] shrink-0 flex-col gap-2">
          {tabs.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {tabs.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`relative rounded-md px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] ${t.id === active.id ? "bg-surface-3 text-ink" : "text-ink-3 hover:text-ink-2"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">{active.node}</div>
        </aside>
      </div>
    </HoverCtx.Provider>
  );
}

export function Track({ r, dashed, opacity = 1 }: { r: number; dashed?: boolean; opacity?: number }) {
  return <circle cx={C} cy={C} r={r} fill="none" stroke="var(--color-line)" strokeOpacity={opacity} strokeDasharray={dashed ? "1 6" : undefined} />;
}

/** A curved label sitting just outside a ring, in the upper-left quadrant. */
export function RingLabel({ id, r, text, at = -32 }: { id: string; r: number; text: string; at?: number }) {
  // Lower half: draw the path the other way round so the text reads upright.
  const norm = ((at % 360) + 360) % 360;
  const bottom = norm > 90 && norm < 270;
  return (
    <>
      <defs><path id={id} d={arc(bottom ? r + 9 : r, at - 40, at + 40, bottom)} /></defs>
      <text className="fill-ink-4 font-mono" fontSize={11} letterSpacing="0.2em">
        <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">{text}</textPath>
      </text>
    </>
  );
}

export function Center({ agent, state = "idle", title, sub, line, onClick }: {
  agent: { seed: number; accent: string } | null; state?: AgentState; title: string; sub?: string; line?: string; onClick?: () => void;
}) {
  const accent = agent?.accent ?? "var(--accent)";
  return (
    <g className={onClick ? "cursor-pointer" : ""} onClick={onClick}>
      <circle cx={C} cy={C} r={118} fill="#111113" stroke={accent} strokeOpacity={0.5} />
      <circle cx={C} cy={C} r={110} fill="none" stroke={accent} strokeOpacity={0.2} strokeDasharray="2 6" />
      {agent && <AvatarG seed={agent.seed} accent={agent.accent} size={140} cx={C} cy={C - 24} state={state} />}
      <text x={C} y={C + 58} textAnchor="middle" className="fill-ink" fontSize={18} fontWeight={600}>{title}</text>
      {sub && <text x={C} y={C + 78} textAnchor="middle" className="fill-ink-3 font-mono" fontSize={10} letterSpacing="0.12em">{sub}</text>}
      {line && <text x={C} y={C + 96} textAnchor="middle" fill={accent} className="font-mono" fontSize={10.5}>{line}</text>}
    </g>
  );
}

/** A clickable body on a ring: planet, blip or marker. */
export function Node({ x, y, r, color, fill = 0.25, glow, label, sub, hover, onClick, children }: {
  x: number; y: number; r: number; color: string; fill?: number; glow?: boolean;
  label?: string; sub?: string; hover?: Hover; onClick?: () => void; children?: ReactNode;
}) {
  const setHover = useHover();
  const [hot, setHot] = useState(false);
  return (
    <g className={onClick || hover ? "cursor-pointer" : ""} onClick={onClick}
      onMouseEnter={() => { setHot(true); if (hover) setHover(hover); }}
      onMouseLeave={() => { setHot(false); setHover(null); }}>
      <circle cx={x} cy={y} r={r + (hot ? 3 : 0)} fill={color} fillOpacity={fill} stroke={color}
        style={glow ? { filter: `drop-shadow(0 0 8px ${color})` } : undefined} />
      {children}
      {label && (
        <text x={x} y={y + r + 17} textAnchor="middle" className={glow ? "fill-ink" : "fill-ink-2"} fontSize={12.5}>
          {label}{sub && <tspan className="fill-ink-3 font-mono" fontSize={10.5}> · {sub}</tspan>}
        </text>
      )}
    </g>
  );
}

/** An agent as a character on a ring. */
export function AgentNode({ x, y, size = 64, profile, state, label, sub, hover, onClick, selected }: {
  x: number; y: number; size?: number; profile: { seed: number; accent: string }; state?: AgentState;
  label: string; sub?: string; hover?: Hover; onClick?: () => void; selected?: boolean;
}) {
  const setHover = useHover();
  return (
    <g className="cursor-pointer" onClick={onClick} onMouseEnter={() => hover && setHover(hover)} onMouseLeave={() => setHover(null)}>
      {selected && <circle cx={x} cy={y} r={size * 0.56} fill="none" stroke={profile.accent} strokeWidth={2} strokeDasharray="3 5" />}
      <AvatarG seed={profile.seed} accent={profile.accent} size={size} cx={x} cy={y} state={state} />
      <text x={x} y={y + size * 0.5 + 14} textAnchor="middle" className={selected ? "fill-ink" : "fill-ink-2"} fontSize={12.5} fontWeight={selected ? 600 : 400}>{label}</text>
      {sub && <text x={x} y={y + size * 0.5 + 29} textAnchor="middle" className="fill-ink-4 font-mono" fontSize={10}>{sub}</text>}
    </g>
  );
}

export function LaunchNode({ l, x, y, color }: { l: Launcher; x: number; y: number; color: string }) {
  const src = useIcon(l.id);
  const { fire, fired } = useLaunch();
  const setHover = useHover();
  const r = 15.5;
  return (
    <g className="cursor-pointer" onClick={() => fire(l)}
      onMouseEnter={() => setHover({ title: l.name, color, lines: [l.kind === "editor" ? "open in Cursor" : l.target.replace(/^https?:\/\//, "")], hint: `${l.key.toUpperCase()} in this mode · click to launch` })}
      onMouseLeave={() => setHover(null)}>
      <circle cx={x} cy={y} r={r} fill="var(--color-surface-2)" stroke={fired === l.id ? "var(--color-ink)" : color} strokeOpacity={fired === l.id ? 1 : 0.45} strokeWidth={fired === l.id ? 2 : 1} />
      {src
        ? <image href={src} x={x - 11.5} y={y - 11.5} width={23} height={23} preserveAspectRatio="xMidYMid meet" style={{ clipPath: "circle(48%)" }} />
        : <text x={x} y={y} textAnchor="middle" dominantBaseline="central" className="fill-ink-2 font-mono" fontSize={10.5} fontWeight={600}>{l.name.slice(0, 2)}</text>}
      <g>
        <circle cx={x + 12} cy={y - 12} r={7} fill="var(--color-surface-3)" stroke="var(--color-line-2)" />
        <text x={x + 12} y={y - 12} textAnchor="middle" dominantBaseline="central" fill="var(--color-ink-2)" fontSize={9} fontWeight={700} className="font-mono">
          {l.key.toUpperCase()}
        </text>
      </g>
    </g>
  );
}

/** A mode's launchers around the rim in two staggered rows, keycap letter on each. */
export function LauncherRing({ mode, color, r0 = 446, r1 = 478, start = 0, span = 360 }: {
  mode: string; color: string; r0?: number; r1?: number; start?: number; span?: number;
}) {
  const { launchers } = useData();
  const list = (launchers.data ?? []).filter((l) => l.mode === mode);
  return (
    <g>
      {list.map((l, i) => {
        const [x, y] = pt(i % 2 === 0 ? r1 : r0, around(list.length, i, start, span));
        return <LaunchNode key={l.id} l={l} x={x} y={y} color={color} />;
      })}
    </g>
  );
}

export function Crumb({ children, onClick, active }: { children: ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} disabled={!onClick || active}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] ${active ? "border-accent/60 bg-accent/10 text-ink" : "border-line-2 bg-surface-1/80 text-ink-2 hover:text-ink"}`}>
      {children}
    </button>
  );
}
