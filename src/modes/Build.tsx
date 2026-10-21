// Build as a world: Atlas at the centre, a 30-day commit ring coloured by
// project, project planets with roadmap rings (enter any of them), uncommitted
// work flagged beside each planet, dev tools on the rim.

import { useEffect, useRef, useState } from "react";
import { AgentProfile, api } from "../api";
import AgentConsole from "../components/AgentConsole";
import { AgentState } from "../components/Avatar";
import DirOrbit from "../components/DirOrbit";
import { ProjectCard } from "../components/ProjectCard";
import { Center, Crumb, LauncherRing, Node, RingLabel, Track, World } from "../components/rings";
import { useData } from "../data";
import { timeAgo } from "../hooks";
import { pt } from "../lib/polar";
import { useDirNav } from "../lib/useDirNav";
import { modeById } from "../modes";
import { Activity } from "./BuildParts";

const ACCENT = modeById("build").accent;
const R = { stream: 168, planets: 290, dirty: 362 };

export default function Build() {
  const { projects } = useData();
  const [orch, setOrch] = useState<AgentProfile | null>(null);
  const nav = useDirNav();
  const [tab, setTab] = useState("agent");
  const [state, setState] = useState<AgentState>("idle");
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);
  const nonce = useRef(0);
  useEffect(() => { api.orchestrator().then(setOrch).catch(() => {}); }, []);

  const ps = [...(projects.data ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const commits7d = ps.reduce((n, p) => n + (p.git?.commits7d ?? 0), 0);
  const now = Date.now();
  const blips = ps.flatMap((p) => (p.git?.recent ?? []).map((c) => ({ ...c, p, days: (now - new Date(c.at).getTime()) / 86_400_000 }))).filter((c) => c.days >= 0 && c.days <= 30);
  const ask = (text: string) => { setPrefill({ text, nonce: ++nonce.current }); setTab("agent"); };

  const agent = nav.scan?.agent ?? orch;
  const tabs = [
    { id: "agent", label: nav.scan ? nav.scan.agent.name : "Atlas", node: agent
        ? <AgentConsole key={agent.id} profile={agent} scope={nav.scan ? nav.scan.path : "root"} prefill={prefill} onState={setState} />
        : <div className="text-xs text-ink-3">Loading…</div> },
    { id: "projects", label: "Projects", node: <div className="space-y-3">{ps.map((p) => <ProjectCard key={p.id} p={p} detailed />)}</div> },
    { id: "stream", label: "Commits", node: <Activity /> },
  ];

  const crumbs = (
    <>
      <Crumb onClick={nav.path ? () => nav.setPath(null) : undefined} active={!nav.path}>Build</Crumb>
      {(nav.scan?.crumbs ?? []).map(([name, p], i, all) => (
        <span key={p} className="flex items-center gap-2"><span className="text-ink-4">›</span>
          <Crumb onClick={() => nav.setPath(p)} active={i === all.length - 1}>{name}</Crumb></span>
      ))}
      {nav.path && <span className="ml-1 font-mono text-[10.5px] text-ink-4">esc · up</span>}
      {nav.error && <span className="text-xs text-critical">{nav.error}</span>}
    </>
  );

  return (
    <World title="Build" crumbs={crumbs} tabs={tabs} tab={tab} setTab={setTab}>
      {nav.path && nav.scan ? (
        <DirOrbit scan={nav.scan} state={state} enter={nav.setPath} askAbout={ask} />
      ) : (
        <>
          <LauncherRing mode="build" color={ACCENT} />

          {/* uncommitted work, flagged beside each planet */}
          <Track r={R.dirty} dashed opacity={0.6} />
          {ps.map((p, i) => {
            const d = p.git?.dirtyFiles ?? 0;
            if (!d) return null;
            const [x, y] = pt(R.dirty, (i / ps.length) * 360);
            return <Node key={p.id} x={x} y={y} r={Math.min(12, 4 + Math.sqrt(d))} color="var(--color-warning)" fill={0.5} label={`${d}`}
              hover={{ title: `${p.name}: ${d} uncommitted file${d > 1 ? "s" : ""}`, lines: ["work that isn't saved in git yet"], color: "var(--color-warning)" }} />;
          })}
          <RingLabel id="lbl-dirty" r={R.dirty + 22} text="UNCOMMITTED" at={-150} />

          {/* projects */}
          <Track r={R.planets} />
          {ps.map((p, i) => {
            const [x, y] = pt(R.planets, (i / ps.length) * 360);
            const c7 = p.git?.commits7d ?? 0;
            const r = 12 + 16 * Math.sqrt(Math.min(c7, 40) / 40);
            const pct = p.roadmap && p.roadmap.total > 0 ? p.roadmap.done / p.roadmap.total : null;
            const ring = 2 * Math.PI * (r + 6);
            return (
              <Node key={p.id} x={x} y={y} r={r} color={p.accent} fill={c7 ? 0.32 : 0.14} glow={c7 > 0}
                label={p.name} sub={pct === null ? undefined : `${Math.round(pct * 100)}%`}
                onClick={p.exists ? () => nav.setPath(p.path) : undefined}
                hover={{ title: p.name, color: p.accent, lines: [p.tagline, pct === null ? "no roadmap" : `roadmap ${p.roadmap!.done}/${p.roadmap!.total}`, p.git ? `${c7} commits this week · last ${timeAgo(p.git.lastCommitAt)}` : ""].filter(Boolean), hint: "click → enter the repo, meet its agent" }}>
                <circle cx={x} cy={y} r={r + 6} fill="none" stroke="var(--color-surface-3)" strokeWidth={2} />
                {pct !== null && <circle cx={x} cy={y} r={r + 6} fill="none" stroke={p.accent} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={`${ring * pct} ${ring}`} transform={`rotate(-90 ${x} ${y})`} />}
              </Node>
            );
          })}
          <RingLabel id="lbl-projects" r={R.planets + 46} text={`PROJECTS · ${ps.length} · RING = ROADMAP`} at={-30} />

          {/* 30-day commit stream */}
          <Track r={R.stream} />
          {Array.from({ length: 30 }, (_, d) => {
            const [x0, y0] = pt(R.stream - (d % 7 === 0 ? 8 : 3), (d / 30) * 360), [x1, y1] = pt(R.stream + (d % 7 === 0 ? 8 : 3), (d / 30) * 360);
            return <line key={d} x1={x0} y1={y0} x2={x1} y2={y1} stroke={d === 0 ? ACCENT : "var(--color-line-2)"} strokeWidth={d === 0 ? 2 : 1} />;
          })}
          {blips.map((c, i) => {
            const [x, y] = pt(R.stream + ((i % 3) - 1) * 9, (c.days / 30) * 360);
            return <Node key={i} x={x} y={y} r={4.5} color={c.p.accent} fill={0.9}
              hover={{ title: c.subject, color: c.p.accent, lines: [`${c.p.name} · ${timeAgo(c.at)}`] }} />;
          })}
          <RingLabel id="lbl-stream" r={R.stream + 26} text="COMMITS · 30 DAYS · TODAY AT TOP" at={-40} />

          <Center agent={orch} state={state} title="Atlas" sub="ORCHESTRATOR · BUILD" line={`${commits7d} COMMITS THIS WEEK`} onClick={() => setTab("agent")} />
        </>
      )}
    </World>
  );
}
