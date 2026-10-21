// CODE: Java interview practice as a world. Patterns on the inner ring, each with its
// mastery arc; every problem on the outer ring, under its pattern; the interviewer at
// the centre. Opening a problem swaps the rings for the workbench.

import { useCallback, useEffect, useState } from "react";
import { api, CodeOverview, PatternGuide } from "../api";
import Workbench from "../components/code/Workbench";
import { bigO } from "../lib/bigo";
import { Center, LauncherRing, Node, RingLabel, seedOf, Track, World } from "../components/rings";
import { arc, pt } from "../lib/polar";
import { Drills, PatternPanel, ProgressPanel, statusOf, Today, Toolkit } from "./CodeParts";

const ACCENT = "#21b3c4";
const R = { patterns: 196, problems: 318 };
const SPAN = 360 / 14;

export default function Code() {
  const [o, setO] = useState<CodeOverview | null>(null);
  const [guides, setGuides] = useState<PatternGuide[]>([]);
  const [tab, setTab] = useState(() => new URLSearchParams(location.search).get("tab") ?? "today");
  const [pattern, setPattern] = useState<string>("hashing");
  const [open, setOpen] = useState<{ id: string; mode: "practice" | "mock" } | null>(() => {
    const q = new URLSearchParams(location.search).get("problem");
    return q ? { id: q, mode: (new URLSearchParams(location.search).get("as") as "mock") ?? "practice" } : null;
  });
  const refresh = useCallback(() => { api.codeOverview().then(setO).catch(() => {}); }, []);
  useEffect(() => { refresh(); api.codePatterns().then(setGuides).catch(() => {}); }, [refresh]);

  const start = (id: string, mode: "practice" | "mock" = "practice") => setOpen({ id, mode });
  if (open) return <Workbench key={`${open.id}-${open.mode}`} id={open.id} mode={open.mode} close={() => { setOpen(null); refresh(); }} />;
  if (!o) return <div className="flex h-full items-center justify-center text-[12px] text-ink-3">Loading…</div>;

  const guide = (id: string) => guides.find((g) => g.id === id);
  const angle = (i: number) => i * SPAN;
  const due = o.problems.filter((p) => p.due).length;
  const next = o.plan.next ? o.problems.find((p) => p.id === o.plan.next) : undefined;

  const tabs = [
    { id: "today", label: "Today", node: <Today o={o} open={start} toDrills={() => setTab("drills")} /> },
    { id: "pattern", label: guide(pattern)?.short ?? "Pattern", node: <PatternPanel g={guide(pattern)} o={o} open={start} /> },
    { id: "drills", label: "Drills", node: <Drills refresh={refresh} /> },
    { id: "toolkit", label: "Toolkit", node: <Toolkit /> },
    { id: "progress", label: "Progress", node: <ProgressPanel o={o} guides={guides} /> },
  ];

  return (
    <World title="Code" crumbs={<span className="label">Code · Java interview practice, judged by running Java</span>} tabs={tabs} tab={tab} setTab={setTab}>
      <LauncherRing mode="code" color={ACCENT} />

      {/* problems, each under its pattern */}
      <Track r={R.problems} dashed />
      {o.patterns.map((s, i) => {
        const ps = o.problems.filter((p) => p.pattern === s.id);
        return ps.map((p, k) => {
          const a = angle(i) + (ps.length < 2 ? 0 : -SPAN * 0.32 + (k / (ps.length - 1)) * SPAN * 0.64);
          const [x, y] = pt(R.problems, a);
          const [px, py] = pt(R.patterns + 26, angle(i));
          const st = statusOf(p);
          const r = p.difficulty === "hard" ? 8 : p.difficulty === "medium" ? 6.5 : 5;
          const lines = [
            `${p.difficulty} · target ${bigO(p.target)}`,
            p.due ? `due for review since ${p.progress.due}` : p.progress.status === "solved" ? `solved ${p.progress.solves}× · next review ${p.progress.due}` : p.progress.status === "attempted" ? `attempted ${p.progress.attempts}× — not solved yet` : "new",
          ];
          return (
            <g key={p.id}>
              <line x1={px} y1={py} x2={x} y2={y} stroke={st.color} strokeOpacity={p.progress.status ? 0.28 : 0.1} />
              <Node x={x} y={y} r={r} color={st.color} fill={p.progress.status ? 0.85 : 0.08} glow={p.due} onClick={() => start(p.id)}
                hover={{ title: p.title, color: st.color, lines, hint: "click → open the workbench" }} />
            </g>
          );
        });
      })}
      <RingLabel id="lbl-problems" r={R.problems + 24} text="PROBLEMS · AMBER IS DUE FOR REVIEW" at={-14} />

      {/* patterns, with their mastery arcs */}
      <Track r={R.patterns} />
      {o.patterns.map((s, i) => {
        const [x, y] = pt(R.patterns, angle(i));
        const g = guide(s.id);
        const sel = tab === "pattern" && pattern === s.id;
        const rr = 19;
        return (
          <g key={s.id}>
            <circle cx={x} cy={y} r={rr + 5} fill="none" stroke="var(--color-line-2)" strokeWidth={2.5} />
            {s.mastery > 0 && (
              s.mastery >= 0.999
                ? <circle cx={x} cy={y} r={rr + 5} fill="none" stroke={ACCENT} strokeWidth={2.5} />
                : <path d={arcAt(x, y, rr + 5, 0, 360 * s.mastery)} fill="none" stroke={ACCENT} strokeWidth={2.5} strokeLinecap="round" />
            )}
            <Node x={x} y={y} r={rr} color={ACCENT} fill={0.12 + 0.5 * s.mastery} glow={sel || s.due > 0}
              label={g?.short ?? s.id} sub={`${s.solved}/${s.total}`}
              onClick={() => { setPattern(s.id); setTab("pattern"); }}
              hover={{ title: g?.name ?? s.id, color: ACCENT, lines: [g?.idea.split(". ")[0] ?? "", `${s.solved}/${s.total} solved · ${Math.round(s.mastery * 100)}% mastery${s.due ? ` · ${s.due} due` : ""}`], hint: "click → the pattern guide" }} />
          </g>
        );
      })}
      <RingLabel id="lbl-patterns" r={R.patterns + 50} text="PATTERNS · MASTERY" at={196} />

      <Center agent={{ seed: seedOf("code-interviewer"), accent: ACCENT }} title="Interviewer"
        sub={`JAVA 17 · ${o.solved}/${o.problems.length} SOLVED`}
        line={!o.java ? "NO JDK FOUND" : due ? `${due} DUE · STREAK ${o.streak}` : next ? `NEXT: ${next.title.toUpperCase()}` : `STREAK ${o.streak}`}
        onClick={() => setTab("today")} />
    </World>
  );
}

/** An arc around an arbitrary point, clockwise from 12 o'clock. */
function arcAt(cx: number, cy: number, r: number, a0: number, a1: number) {
  // polar's arc() is centred on the canvas; shift its path to (cx, cy).
  const d = arc(r, a0, a1);
  return d.replace(/(-?\d+\.\d+),(-?\d+\.\d+)/g, (_, x, y) => `${(+x - 500 + cx).toFixed(2)},${(+y - 500 + cy).toFixed(2)}`);
}
