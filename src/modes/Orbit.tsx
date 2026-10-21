// Orbit: the home view as concentric rings instead of a grid.
//
//   center    now — the time and the class that's on or next
//   r 158     the day: 24h dial, classes as arcs, a sweeping now-hand
//   r 258     projects as planets (size = this week's commits, ring = roadmap %)
//   r 330     signals: radar blips for anything that wants attention
//   r 380-416 sectors: the modes, click to dive in
//   r 444/476 launchers, in their sector, two staggered rows
//
// Distance from the center is distance from right now.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentProfile, api, DirScan, MissionSummary, Opportunity, Project } from "../api";
import AgentConsole from "../components/AgentConsole";
import { Avatar, AvatarG, AgentState } from "../components/Avatar";
import DirOrbit from "../components/DirOrbit";
import { HoverCtx, LaunchNode } from "../components/rings";
import { gb, STATUS, Status } from "../components/ui";
import { useData } from "../data";
import { timeAgo, useNow } from "../hooks";
import { duration, hhmm, isoDay, minutesOf, nowAndNext, semesterWeek } from "../lib/time";
import { ModeId, MODES } from "../modes";
import { arc, band, C, pt, reducedMotion } from "../lib/polar";
import { useShell } from "../shell";
import { crashFreeStatus } from "./OpsParts";

const R = { core: 116, dial: 158, orbit: 258, signal: 330, band0: 380, band1: 416, rowA: 446, rowB: 478 };
const COURSE = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9", "#e66767", "#008300"];
const SECTORS = MODES.filter((m) => m.id !== "command");
const SPAN = 360 / SECTORS.length;

const sectorOf = (id: ModeId) => {
  const i = SECTORS.findIndex((s) => s.id === id);
  const mid = i * SPAN;
  return { mid, a0: mid - SPAN / 2, a1: mid + SPAN / 2 };
};

interface Hover { title: string; lines: string[]; color?: string; hint?: string }


// ─────────────────────────────────────────────────────────────── layers ──

function DayDial({ setHover }: { setHover: (h: Hover | null) => void }) {
  const now = useNow(1000);
  const { schedule } = useData();
  const courses = schedule.data?.courses ?? [];
  const codes = courses.map((c) => c.code);
  const today = courses.filter((c) => c.days.includes(isoDay(now)));
  const nowMin = minutesOf(now);
  const toA = (m: number) => (m / 1440) * 360;
  const nowA = toA(nowMin);
  const [hx, hy] = pt(R.core + 4, nowA), [tx, ty] = pt(R.dial + 20, nowA), [kx, ky] = pt(R.dial, nowA);

  return (
    <g>
      <circle cx={C} cy={C} r={R.dial} fill="none" stroke="var(--color-surface-3)" strokeWidth={12} />
      {/* the part of today that's already gone */}
      <path d={arc(R.dial, 0, Math.max(0.1, nowA))} fill="none" stroke="var(--accent)" strokeOpacity={0.12} strokeWidth={12} />
      {Array.from({ length: 24 }, (_, h) => {
        const a = h * 15, major = h % 6 === 0;
        const [x0, y0] = pt(R.dial + 9, a), [x1, y1] = pt(R.dial + (major ? 18 : 13), a);
        return <line key={h} x1={x0} y1={y0} x2={x1} y2={y1} stroke={major ? "var(--color-ink-3)" : "var(--color-line-2)"} strokeWidth={major ? 1.5 : 1} />;
      })}
      {[0, 6, 12, 18].map((h) => {
        const [x, y] = pt(R.dial + 31, h * 15);
        return <text key={h} x={x} y={y} textAnchor="middle" dominantBaseline="central" className="fill-ink-3 font-mono" fontSize={12}>{hhmm(h * 60).replace(":00", "")}</text>;
      })}
      {today.map((c) => {
        const color = COURSE[codes.indexOf(c.code) % COURSE.length];
        const past = nowMin >= c.end, live = nowMin >= c.start && nowMin < c.end;
        return (
          <path key={c.code} d={arc(R.dial, toA(c.start), toA(c.end))} fill="none" stroke={color} strokeWidth={live ? 16 : 12}
            strokeOpacity={past ? 0.35 : 1} strokeLinecap="butt" className="cursor-pointer"
            onMouseEnter={() => setHover({ title: `${c.code} · ${c.title}`, color, lines: [`${hhmm(c.start)}–${hhmm(c.end)} · ${c.room}`, live ? "happening now" : past ? "done for today" : `starts in ${duration((c.start - nowMin) * 60_000)}`] })}
            onMouseLeave={() => setHover(null)} />
        );
      })}
      <line x1={hx} y1={hy} x2={tx} y2={ty} stroke="var(--accent)" strokeWidth={2} style={{ filter: "drop-shadow(0 0 6px var(--accent))" }} />
      <circle cx={kx} cy={ky} r={4.5} fill="var(--color-bg)" stroke="var(--accent)" strokeWidth={2} />
    </g>
  );
}

function Core({ agent, state, open }: { agent: AgentProfile | null; state: AgentState; open: () => void }) {
  const now = useNow(1000);
  const { schedule } = useData();
  const courses = schedule.data?.courses ?? [];
  const { current, next } = nowAndNext(courses, now);
  const week = semesterWeek(schedule.data?.firstDay ?? "", now);
  const hm = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const line = current
    ? `IN ${current.course.code} · ENDS ${duration(current.end.getTime() - now.getTime()).toUpperCase()}`
    : next ? `${next.course.code} IN ${duration(next.start.getTime() - now.getTime()).toUpperCase()}` : "";
  return (
    <g>
      <defs>
        <radialGradient id="core-fill" cx="50%" cy="38%" r="70%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.18} />
          <stop offset="70%" stopColor="#111113" stopOpacity={0.95} />
        </radialGradient>
      </defs>
      <g className="cursor-pointer" onClick={open}>
        <circle cx={C} cy={C} r={R.core} fill="url(#core-fill)" stroke="var(--color-line-2)" />
        <circle cx={C} cy={C} r={R.core - 8} fill="none" stroke="var(--accent)" strokeOpacity={0.25} strokeDasharray="2 6" />
        {agent && <AvatarG seed={agent.seed} accent={agent.accent} size={96} cx={C} cy={C - 40} state={state} orchestrator />}
        <text x={C} y={C + 34} textAnchor="middle" className="fill-ink" fontSize={40} fontWeight={200} style={{ fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
          {hm}<tspan fontSize={14} fill="var(--accent)" dx={4} className="font-mono">{String(now.getSeconds()).padStart(2, "0")}</tspan>
        </text>
        <text x={C} y={C + 56} textAnchor="middle" className="fill-ink-3 font-mono" fontSize={10} letterSpacing="0.14em">
          {now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).toUpperCase()}{week ? ` · WK ${week}` : ""}
        </text>
        {line && <text x={C} y={C + 74} textAnchor="middle" className="fill-ink-2 font-mono" fontSize={9.5} letterSpacing="0.1em">{line}</text>}
      </g>
    </g>
  );
}

function Planets({ projects, setHover, onPick }: { projects: Project[]; setHover: (h: Hover | null) => void; onPick: (p: Project) => void }) {
  const now = useNow(1000);
  // One revolution every 30 minutes: alive, never distracting.
  const spin = reducedMotion() ? 0 : ((now.getTime() / 1000) % 1800) * (360 / 1800);
  const n = Math.max(1, projects.length);
  return (
    <g>
      <circle cx={C} cy={C} r={R.orbit} fill="none" stroke="var(--color-line)" strokeDasharray="1 5" />
      {projects.map((p, i) => {
        const a = spin + (i * 360) / n;
        const [x, y] = pt(R.orbit, a);
        const c7 = p.git?.commits7d ?? 0;
        const r = 9 + 14 * Math.sqrt(Math.min(c7, 40) / 40);
        const pct = p.roadmap && p.roadmap.total > 0 ? p.roadmap.done / p.roadmap.total : null;
        const ring = 2 * Math.PI * (r + 5);
        const dim = c7 === 0;
        return (
          <g key={p.id} className="cursor-pointer" onClick={() => onPick(p)}
            onMouseEnter={() => setHover({
              title: p.name, color: p.accent,
              lines: [
                p.tagline,
                pct === null ? (p.note ? "waiting for folder access" : "no roadmap yet") : `roadmap ${Math.round(pct * 100)}% · ${p.roadmap!.done}/${p.roadmap!.total}`,
                p.git ? `${c7} commits this week · last ${timeAgo(p.git.lastCommitAt)}${p.git.dirtyFiles ? ` · ${p.git.dirtyFiles} uncommitted` : ""}` : "",
              ].filter(Boolean),
              hint: `click → enter ${p.name}, meet its agent`,
            })}
            onMouseLeave={() => setHover(null)}>
            <circle cx={x} cy={y} r={r + 5} fill="none" stroke="var(--color-surface-3)" strokeWidth={2} />
            {pct !== null && (
              <circle cx={x} cy={y} r={r + 5} fill="none" stroke={p.accent} strokeWidth={2} strokeLinecap="round"
                strokeDasharray={`${ring * pct} ${ring}`} transform={`rotate(-90 ${x} ${y})`} />
            )}
            <circle cx={x} cy={y} r={r} fill={p.accent} fillOpacity={dim ? 0.16 : 0.3} stroke={p.accent} strokeOpacity={dim ? 0.7 : 1}
              style={dim ? undefined : { filter: `drop-shadow(0 0 8px ${p.accent})` }} />
            <text x={x} y={y + r + 19} textAnchor="middle" className={dim ? "fill-ink-3" : "fill-ink"} fontSize={13}>{p.name}</text>
          </g>
        );
      })}
    </g>
  );
}

interface Signal { id: string; sector: ModeId; status: Status; label: string; hover: Hover }

function Signals({ signals, setHover, dive }: { signals: Signal[]; setHover: (h: Hover | null) => void; dive: (m: ModeId) => void }) {
  return (
    <g>
      <circle cx={C} cy={C} r={R.signal} fill="none" stroke="var(--color-line)" />
      {SECTORS.map((s) => {
        const mine = signals.filter((x) => x.sector === s.id);
        const { mid } = sectorOf(s.id);
        return mine.map((sig, k) => {
          const a = mid + (k - (mine.length - 1) / 2) * 11;
          const [x, y] = pt(R.signal, a);
          // Labels sit outside the blip, in the gap before the sector band, clear of planet labels.
          const [lx, ly] = pt(R.signal + 22, a);
          const col = STATUS[sig.status].color;
          const urgent = sig.status === "critical" || sig.status === "warning" || sig.status === "serious";
          return (
            <g key={sig.id} className="cursor-pointer" onClick={() => dive(s.id)} onMouseEnter={() => setHover(sig.hover)} onMouseLeave={() => setHover(null)}>
              {urgent && !reducedMotion() && (
                <circle cx={x} cy={y} r={6} fill="none" stroke={col}>
                  <animate attributeName="r" from="6" to="16" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.8" to="0" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              <circle cx={x} cy={y} r={6.5} fill={col} stroke="var(--color-bg)" strokeWidth={2} />
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" className="fill-ink-2 font-mono" fontSize={11.5}>{sig.label}</text>
            </g>
          );
        });
      })}
    </g>
  );
}

function Sectors({ active, setActive, dive }: { active: ModeId | null; setActive: (m: ModeId | null) => void; dive: (m: ModeId) => void }) {
  return (
    <g>
      <defs>
        {SECTORS.map((s) => {
          const { mid, a0, a1 } = sectorOf(s.id);
          const bottom = ((mid % 360) + 360) % 360 > 90 && ((mid % 360) + 360) % 360 < 270;
          const r = (R.band0 + R.band1) / 2 + (bottom ? 4 : -4);
          return <path key={s.id} id={`sector-label-${s.id}`} d={arc(r, a0 + 2, a1 - 2, bottom)} />;
        })}
      </defs>
      {SECTORS.map((s, i) => {
        const { a0, a1 } = sectorOf(s.id);
        const on = active === s.id;
        return (
          <g key={s.id} className="cursor-pointer" onClick={() => dive(s.id)} onMouseEnter={() => setActive(s.id)} onMouseLeave={() => setActive(null)}>
            <path d={band(R.band0, R.band1, a0 + 0.8, a1 - 0.8)} fill={s.accent} fillOpacity={on ? 0.34 : 0.1}
              stroke={s.accent} strokeOpacity={on ? 0.9 : 0.35} style={{ transition: "fill-opacity 160ms, stroke-opacity 160ms" }} />
            <text className="font-mono" fontSize={14} letterSpacing="0.2em" fill={on ? "var(--color-ink)" : "var(--color-ink-2)"}>
              <textPath href={`#sector-label-${s.id}`} startOffset="50%" textAnchor="middle">
                {s.name.toUpperCase()}  ⌘{i + 2}
              </textPath>
            </text>
          </g>
        );
      })}
    </g>
  );
}

function Launchers() {
  const { launchers } = useData();
  const list = launchers.data ?? [];
  return (
    <g>
      {SECTORS.map((s) => {
        const mine = list.filter((l) => l.mode === s.id);
        const { a0 } = sectorOf(s.id);
        const pad = 4, usable = SPAN - pad * 2;
        return mine.map((l, k) => {
          const a = a0 + pad + ((k + 0.5) * usable) / Math.max(1, mine.length);
          const [x, y] = pt(k % 2 === 0 ? R.rowB : R.rowA, a);
          return <LaunchNode key={l.id} l={l} x={x} y={y} color={s.accent} />;
        });
      })}
    </g>
  );
}

// ────────────────────────────────────────────────────────────── readouts ──

function Readout({ title, children, align = "left" }: { title: string; children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <div className={`rise w-[264px] ${align === "right" ? "text-right" : ""}`}>
      <div className={`label mb-2 flex items-center gap-2 ${align === "right" ? "justify-end" : ""}`}>
        <span className="h-px w-6 bg-accent" />{title}
      </div>
      <div className="space-y-1.5 text-[12px] text-ink-2">{children}</div>
    </div>
  );
}

function Line({ status, children }: { status?: Status; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 truncate">
      {status && <span style={{ color: STATUS[status].color }} className="text-[9px]">{STATUS[status].icon}</span>}
      <span className="truncate">{children}</span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────── orbit ──

export default function Orbit() {
  const { projects, health, sentry, revenue, stats, schedule } = useData();
  const { setMode } = useShell();
  const [hover, setHover] = useState<Hover | null>(null);
  const [active, setActive] = useState<ModeId | null>(null);
  const [diving, setDiving] = useState(false);
  const [feed, setFeed] = useState<Opportunity[]>([]);
  const [missions, setMissions] = useState<MissionSummary[]>([]);
  const [ask_, setAsk] = useState("");
  // Nesting: null is the root; otherwise the folder whose world we're in.
  const [path, setPath] = useState<string | null>(() => new URLSearchParams(location.search).get("dir"));
  const [scan, setScan] = useState<DirScan | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [orch, setOrch] = useState<AgentProfile | null>(null);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);
  const nonce = useRef(0);
  const askAgent = (text: string) => { setPrefill({ text, nonce: ++nonce.current }); setConsoleOpen(true); };
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(800);
  const now = useNow(30_000);

  useEffect(() => {
    const load = () => {
      api.opportunities().then((f) => setFeed(f.items)).catch(() => {});
      api.missions().then(setMissions).catch(() => {});
    };
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { api.orchestrator().then(setOrch).catch(() => {}); }, []);

  useEffect(() => {
    if (!path) { setScan(null); return; }
    setScanError(null);
    api.dirScan(path).then(setScan).catch((e) => setScanError(String(e)));
  }, [path]);

  const up = useCallback(() => {
    if (!path) { setConsoleOpen(false); return; }
    const crumbs = scan?.crumbs ?? [];
    setPath(crumbs.length > 1 ? crumbs[crumbs.length - 2][1] : null);
  }, [path, scan]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "Escape" && !(t && ["INPUT", "TEXTAREA"].includes(t.tagName))) up();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [up]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      // Readouts live in the corners, so the circle can take nearly the full height.
      setSize(Math.max(520, Math.min(width - 340, height - 56)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dive = (m: ModeId) => {
    setDiving(true);
    setTimeout(() => setMode(m), reducedMotion() ? 0 : 220);
  };

  const ps = useMemo(() => [...(projects.data ?? [])].sort((a, b) => a.id.localeCompare(b.id)), [projects.data]);
  const checks = health.data ?? [];
  const sp = sentry.data?.connected ? sentry.data.projects : [];
  const strong = feed.filter((o) => o.status !== "dismissed" && o.status !== "added" && o.score >= 80);
  const running = missions.filter((m) => m.mission.status === "running");
  const s = stats.data;
  const memPct = s ? s.memUsed / s.memTotal : 0;

  const signals: Signal[] = [
    ...checks.map((c): Signal => ({
      id: `h-${c.name}`, sector: "ops", status: c.ok ? "good" : "critical", label: c.ok ? `${c.latencyMs}ms` : "DOWN",
      hover: { title: c.name, lines: [c.ok ? `up · ${c.latencyMs} ms` : `down · ${c.error ?? c.status}`, c.url.replace("https://", "")], hint: "click → Ops" },
    })),
    ...(sentry.data?.connected ? [{
      id: "sentry", sector: "ops" as ModeId, status: crashFreeStatus(Math.min(...sp.map((p) => p.crashFreeRate ?? 1))).status,
      label: `${sp.reduce((n, p) => n + p.unresolved, 0)} issues`,
      hover: { title: "Sentry", lines: sp.map((p) => `${p.slug}: ${p.unresolved} unresolved`), hint: "click → Ops" },
    }] : []),
    ...(strong.length ? [{
      id: "handshake", sector: "career" as ModeId, status: "warning" as Status, label: `${strong.length} match${strong.length > 1 ? "es" : ""}`,
      hover: { title: "Handshake", lines: strong.slice(0, 3).map((o) => `${o.score} · ${o.title} — ${o.employer}`), hint: "click → Career" },
    }] : []),
    ...running.map((m): Signal => ({
      id: `m-${m.mission.id}`, sector: "missions", status: "warning", label: "running",
      hover: { title: m.mission.title, lines: [`${m.sources} sources · ${m.verified}/${m.findings} verified`], hint: "click → Missions" },
    })),
    ...ps.filter((p) => (p.git?.dirtyFiles ?? 0) > 20).map((p): Signal => ({
      id: `d-${p.id}`, sector: "build", status: "serious", label: `${p.git!.dirtyFiles} dirty`,
      hover: { title: `${p.name}: ${p.git!.dirtyFiles} uncommitted files`, lines: ["a lot of work that isn't committed yet"], hint: "click → Build" },
    })),
    ...(s && memPct > 0.85 ? [{
      id: "mem", sector: "ai" as ModeId, status: (memPct > 0.92 ? "critical" : "warning") as Status, label: `${Math.round(memPct * 100)}% mem`,
      hover: { title: "Memory pressure", lines: [`${gb(s.memUsed)} of ${gb(s.memTotal)} GB in use`, "models, Chrome and Docker share this"] },
    }] : []),
  ];

  const courses = schedule.data?.courses ?? [];
  const today = courses.filter((c) => c.days.includes(isoDay(now))).sort((a, b) => a.start - b.start);
  const { next } = nowAndNext(courses, now);
  const latestMission = missions[0];

  if (path) {
    return (
      <div className="flex h-full gap-4">
        <div className="relative min-w-0 flex-1">
          <nav className="absolute left-0 top-0 z-10 flex flex-wrap items-center gap-1.5">
            <button onClick={() => setPath(null)} className="flex items-center gap-1.5 rounded-full border border-line-2 bg-surface-1/80 py-1 pl-1 pr-3 text-[12px] text-ink-2 hover:text-ink">
              {orch && <Avatar seed={orch.seed} accent={orch.accent} size={22} orchestrator />}Atlas
            </button>
            {(scan?.crumbs ?? []).map(([name, p], i, all) => (
              <span key={p} className="flex items-center gap-1.5">
                <span className="text-ink-4">›</span>
                <button onClick={() => setPath(p)} disabled={i === all.length - 1}
                  className={`rounded-full border px-3 py-1 text-[12px] ${i === all.length - 1 ? "border-accent/60 bg-accent/10 text-ink" : "border-line-2 bg-surface-1/80 text-ink-2 hover:text-ink"}`}>{name}</button>
              </span>
            ))}
            <span className="ml-2 font-mono text-[10.5px] text-ink-4">esc · up a level</span>
          </nav>
          {hover && (
            <div className="absolute bottom-2 left-0 z-10 w-[300px]">
              <Readout title="Focus">
                <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
                  {hover.color && <span className="h-2 w-2 rounded-full" style={{ background: hover.color }} />}
                  <span className="truncate">{hover.title}</span>
                </div>
                {hover.lines.map((l, i) => <div key={i} className="truncate text-ink-2">{l}</div>)}
                {hover.hint && <div className="font-mono text-[10.5px] text-ink-4">{hover.hint}</div>}
              </Readout>
            </div>
          )}
          {scanError && <div className="absolute left-0 top-12 z-10 max-w-md rounded-lg bg-critical/10 px-3 py-2 text-xs text-ink-2">{scanError}</div>}
          <div key={path} className="zoom-in absolute inset-0 top-8 flex items-center justify-center">
            <div style={{ width: "min(100%, calc(100vh - 150px))", aspectRatio: "1" }}>
              {scan && <DirOrbit scan={scan} state={agentState} enter={setPath} askAbout={askAgent} setHover={setHover} />}
            </div>
          </div>
        </div>
        <div className="w-[430px] shrink-0">
          {scan && <AgentConsole key={scan.agent.id} profile={scan.agent} scope={scan.path} prefill={prefill} onState={setAgentState} />}
        </div>
      </div>
    );
  }

  return (
    <HoverCtx.Provider value={setHover}>
    <div ref={stage} className="relative h-full w-full overflow-hidden">
      {consoleOpen && orch && (
        <div className="rise absolute bottom-16 right-0 top-0 z-30 w-[430px]">
          <AgentConsole profile={orch} scope="root" prefill={prefill} onState={setAgentState} onClose={() => setConsoleOpen(false)} />
        </div>
      )}
      {/* Corner readouts: instruments, not cards. */}
      <div className="absolute left-2 top-2 z-10">
        <Readout title="Systems">
          {checks.map((c) => <Line key={c.name} status={c.ok ? "good" : "critical"}>{c.name} · {c.ok ? `${c.latencyMs} ms` : "down"}</Line>)}
          <Line status={sentry.data?.connected ? crashFreeStatus(Math.min(...sp.map((p) => p.crashFreeRate ?? 1))).status : "unknown"}>
            Sentry · {sentry.data?.connected ? `${sp.reduce((n, p) => n + p.unresolved, 0)} unresolved` : "not connected"}
          </Line>
          <Line status={revenue.data?.connected ? "good" : "unknown"}>Revenue · {revenue.data?.connected ? "connected" : "not connected"}</Line>
          {s && (
            <div>
              <Line status={memPct > 0.9 ? "critical" : memPct > 0.8 ? "warning" : "good"}>Memory · {gb(s.memUsed)} / {gb(s.memTotal)} GB</Line>
              <div className="ml-4 mt-1 h-[3px] w-40 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full" style={{ width: `${memPct * 100}%`, background: memPct > 0.85 ? "var(--color-warning)" : "var(--accent)" }} />
              </div>
            </div>
          )}
        </Readout>
      </div>

      <div className="absolute right-2 top-2 z-10">
        <Readout title="Today" align="right">
          {today.length === 0 && <div className="text-ink-3">No classes today.</div>}
          {today.map((c) => {
            const m = minutesOf(now), done = m >= c.end, live = m >= c.start && m < c.end;
            return (
              <div key={c.code} className={`truncate ${done ? "text-ink-4" : live ? "text-ink" : ""}`}>
                {done && <span className="mr-1 text-good">✓</span>}{live && <span className="mr-1 text-accent">●</span>}
                <span className="font-mono text-[11px]">{hhmm(c.start)}</span> {c.code} · {c.room}
              </div>
            );
          })}
          {next && <div className="pt-1 font-mono text-[11px] text-accent">next · {next.course.code} in {duration(next.start.getTime() - now.getTime())}</div>}
        </Readout>
      </div>

      <div className="absolute bottom-16 left-2 z-10">
        <Readout title="Signals">
          {strong[0]
            ? <Line status="warning">{strong[0].score} · {strong[0].title} — {strong[0].employer}</Line>
            : <Line status="unknown">Handshake · {feed.length ? "nothing strong right now" : "not scanned yet"}</Line>}
          {latestMission && <Line status={latestMission.mission.status === "running" ? "warning" : latestMission.mission.status === "done" ? "good" : "unknown"}>
            {latestMission.mission.title} · {latestMission.mission.status}</Line>}
          {ps.slice().sort((a, b) => (b.git?.commits7d ?? 0) - (a.git?.commits7d ?? 0))[0] && (() => {
            const top = ps.slice().sort((a, b) => (b.git?.commits7d ?? 0) - (a.git?.commits7d ?? 0))[0];
            return <Line status="good">{top.name} leads · {top.git?.commits7d ?? 0} commits this week</Line>;
          })()}
        </Readout>
      </div>

      <div className="absolute bottom-16 right-2 z-10">
        <Readout title={hover ? "Focus" : "Navigate"} align="right">
          {hover ? (
            <>
              <div className="flex items-center justify-end gap-2 text-[13px] font-medium text-ink">
                {hover.color && <span className="h-2 w-2 rounded-full" style={{ background: hover.color, boxShadow: `0 0 8px ${hover.color}` }} />}
                <span className="truncate">{hover.title}</span>
              </div>
              {hover.lines.map((l, i) => <div key={i} className="truncate text-ink-2">{l}</div>)}
              {hover.hint && <div className="font-mono text-[10.5px] text-ink-4">{hover.hint}</div>}
            </>
          ) : (
            <>
              <div className="text-ink-3">Hover anything on the rings.</div>
              <div className="text-ink-3">Click a sector to dive in.</div>
              <div className="font-mono text-[10.5px] text-ink-4">⌘1–8 modes · ⌘K search · ⌘, settings</div>
            </>
          )}
        </Readout>
      </div>

      {/* The orbit itself, centred in the space above the command line. */}
      <div className="absolute inset-x-0 top-0 bottom-14 flex items-center justify-center">
      <div className="relative shrink-0 transition-[transform,opacity] duration-200 ease-out"
        style={{ width: size, height: size, transform: `scale(${diving ? 1.12 : 1})`, opacity: diving ? 0 : 1 }}>
        <div className="orbit-sweep absolute inset-[3%] rounded-full" />
        <svg viewBox="0 0 1000 1000" className="relative h-full w-full overflow-visible select-none">
          <Sectors active={active} setActive={setActive} dive={dive} />
          <Launchers />
          <Signals signals={signals} setHover={setHover} dive={dive} />
          <Planets projects={ps} setHover={setHover} onPick={(p) => p.exists && setPath(p.path)} />
          <DayDial setHover={setHover} />
          <Core agent={orch} state={agentState} open={() => setConsoleOpen(true)} />
        </svg>
      </div>
      </div>

      {/* Command line: ask Atlas anything. */}
      <div className="absolute bottom-3 left-1/2 z-10 w-[min(640px,60%)] -translate-x-1/2">
        <div className="flex items-center gap-3 rounded-full border border-line-2 bg-surface-1/85 px-4 shadow-2xl backdrop-blur-xl focus-within:border-accent/60">
          <span className="text-accent">✦</span>
          <input value={ask_} onChange={(e) => setAsk(e.target.value)} spellCheck={false}
            onKeyDown={(e) => { if (e.key === "Enter" && ask_.trim()) { askAgent(ask_.trim()); setAsk(""); } }}
            placeholder="Ask Atlas — it answers itself or sends the question to the right project's agent"
            className="selectable h-11 flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-4" />
          <span className="kbd">↵</span>
        </div>
      </div>
    </div>
    </HoverCtx.Provider>
  );
}
