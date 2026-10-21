// Missions as a world: missions orbit the rim (+ starts a new one); the
// selected mission's lead sits at the centre, ringed by its pipeline phases,
// its researchers as characters, the sources they read and the findings that
// survived verification.

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, MissionSummary } from "../api";
import { AgentNode, Center, Node, RingLabel, seedOf, Track, World } from "../components/rings";
import { STATUS, StatusBadge } from "../components/ui";
import { timeAgo } from "../hooks";
import { band, pt } from "../lib/polar";
import { modeById } from "../modes";
import { AGENT_STATUS, deriveLive, FindingsView, LogView, NewMission, PHASES, ReportView, SourcesView, STATUS_OF, useMission } from "./MissionsParts";

const ACCENT = modeById("missions").accent;
const R = { phase0: 150, phase1: 178, agents: 262, sources: 352, findings: 404, rim: 470 };

export default function Missions() {
  const [list, setList] = useState<MissionSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState("report");
  const loadList = useCallback(() => {
    api.missions().then((l) => { setList(l); setLoaded(true); setSelected((s) => s ?? l[0]?.mission.id ?? null); }).catch(() => setLoaded(true));
  }, []);
  useEffect(loadList, [loadList]);
  useEffect(() => {
    const un = api.onMissionEvent((env) => { if (["done", "error", "phase"].includes(env.event.type)) loadList(); });
    return () => { un.then((f) => f()); };
  }, [loadList]);
  // Only once the list has actually loaded: an empty first render isn't "no missions".
  useEffect(() => { if (loaded && list.length === 0) setTab("new"); }, [loaded, list.length]);

  const { d, load } = useMission(selected);
  const live = useMemo(() => deriveLive(d?.events ?? []), [d?.events]);
  const m = d?.mission;
  const running = m?.status === "running";
  const phaseIdx = live.phase === "complete" || m?.status === "done" ? PHASES.length : PHASES.findIndex((p) => p.id === live.phase);
  const verified = d?.findings.filter((f) => f.verified).length ?? 0;

  const tabs = [
    ...(d ? [
      { id: "report", label: "Report", node: <ReportView d={d} /> },
      { id: "findings", label: `Findings ${verified}/${d.findings.length}`, node: <FindingsView d={d} /> },
      { id: "sources", label: `Sources ${d.sources.length}`, node: <SourcesView d={d} /> },
      { id: "log", label: "Log", node: <LogView d={d} /> },
    ] : []),
    { id: "new", label: "+ New", node: <NewMission created={(id) => { loadList(); setSelected(id); setTab("report"); }} /> },
  ];

  const crumbs = m && (
    <div className="flex items-center gap-2">
      <span className="label">Missions</span>
      <StatusBadge status={STATUS_OF[m.status] ?? "unknown"} label={m.status} />
      {running
        ? <button onClick={() => api.cancelMission(m.id)} className="rounded-full border border-line-2 px-3 py-1 text-[11px]">Stop</button>
        : <button onClick={() => api.runMission(m.id).then(load)} className="rounded-full bg-accent px-3 py-1 text-[11px] font-semibold text-black">Run again</button>}
    </div>
  );

  return (
    <World title="Missions" crumbs={crumbs ?? <span className="label">Missions</span>} tabs={tabs} tab={tab} setTab={setTab}>
      {/* missions on the rim; + starts a new one */}
      {[{ id: "__new" } as const, ...list.map((x) => x.mission)].map((mm, i, all) => {
        const [x, y] = pt(R.rim, (i / all.length) * 360);
        if (mm.id === "__new") {
          return (
            <Node key="new" x={x} y={y} r={18} color={ACCENT} fill={0.3} label="New mission" onClick={() => setTab("new")}
              hover={{ title: "New mission", lines: ["brief + references → a swarm researches it"], color: ACCENT }}>
              <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="var(--color-ink)" fontSize={20}>+</text>
            </Node>
          );
        }
        const mission = mm as MissionSummary["mission"];
        const col = STATUS[STATUS_OF[mission.status] ?? "unknown"].color;
        const on = mission.id === selected;
        return (
          <Node key={mission.id} x={x} y={y} r={on ? 14 : 10} color={col} fill={on ? 0.5 : 0.25} glow={on}
            label={mission.title.length > 22 ? `${mission.title.slice(0, 21)}…` : mission.title}
            onClick={() => { setSelected(mission.id); setTab("report"); }}
            hover={{ title: mission.title, color: col, lines: [`${mission.status} · ${timeAgo(mission.created)}`, mission.model], hint: "click → open" }} />
        );
      })}

      {d && m && (
        <>
          {/* findings */}
          <Track r={R.findings} dashed />
          {d.findings.map((f, i) => {
            const a = (i / Math.max(1, d.findings.length)) * 360;
            const [x0, y0] = pt(R.findings - 9, a), [x1, y1] = pt(R.findings + 9, a);
            const col = f.verified ? "var(--color-good)" : "var(--color-critical)";
            return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={col} strokeWidth={3} strokeLinecap="round" />;
          })}
          <RingLabel id="lbl-findings" r={R.findings + 24} text={`FINDINGS · ${verified} VERIFIED · ${d.findings.length - verified} REJECTED`} at={-32} />

          {/* sources */}
          <Track r={R.sources} />
          {d.sources.map((s, i) => {
            const [x, y] = pt(R.sources, (i / Math.max(1, d.sources.length)) * 360);
            return (
              <Node key={s.n} x={x} y={y} r={s.primary ? 7 : 5} color={s.primary ? "var(--color-good)" : "var(--color-ink-3)"} fill={0.8} onClick={() => setTab("sources")}
                hover={{ title: s.title, lines: [s.url.replace(/^https?:\/\//, ""), s.primary ? "primary source" : "secondary source"], hint: "click → sources" }}>
                {s.primary && <circle cx={x} cy={y} r={11} fill="none" stroke="var(--color-good)" strokeOpacity={0.6} />}
              </Node>
            );
          })}
          <RingLabel id="lbl-sources" r={R.sources + 24} text={`SOURCES · ${d.sources.filter((s) => s.primary).length} PRIMARY OF ${d.sources.length}`} at={150} />

          {/* researchers */}
          <Track r={R.agents} />
          {live.agents.map((a, i) => {
            const [x, y] = pt(R.agents, (i / Math.max(1, live.agents.length)) * 360);
            const st = AGENT_STATUS[a.status] ?? "unknown";
            return (
              <AgentNode key={a.agent} x={x} y={y} size={58} profile={{ seed: seedOf(`${m.id}/${a.agent}`), accent: ACCENT }}
                state={["searching", "working", "citing"].includes(a.status) ? "thinking" : "idle"}
                label={a.agent} sub={a.status}
                hover={{ title: `${a.agent} · ${a.status}`, color: STATUS[st].color, lines: [a.question, a.detail].filter(Boolean) }} />
            );
          })}

          {/* phases */}
          {PHASES.map((p, i) => {
            const a0 = i * 72 + 1.5, a1 = (i + 1) * 72 - 1.5;
            const state = i < phaseIdx ? "done" : i === phaseIdx && running ? "active" : "idle";
            const [lx, ly] = pt(R.phase1 + 16, (a0 + a1) / 2);
            return (
              <g key={p.id}>
                <path d={band(R.phase0, R.phase1, a0, a1)} fill={state === "idle" ? "var(--color-surface-3)" : ACCENT} fillOpacity={state === "done" ? 0.55 : state === "active" ? 0.9 : 0.5}>
                  {state === "active" && <animate attributeName="fill-opacity" values="0.9;0.4;0.9" dur="1.4s" repeatCount="indefinite" />}
                </path>
                <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" className={state === "idle" ? "fill-ink-4 font-mono" : "fill-ink font-mono"} fontSize={10.5} letterSpacing="0.1em">{p.name.toUpperCase()}</text>
              </g>
            );
          })}

          <Center agent={{ seed: seedOf(m.id), accent: ACCENT }} state={running ? "thinking" : "idle"}
            title={m.title.length > 24 ? `${m.title.slice(0, 23)}…` : m.title} sub={`LEAD · ${m.model.split(" ")[0].toUpperCase().slice(0, 18)}`}
            line={`${d.sources.length} SOURCES · ${verified}/${d.findings.length} VERIFIED`} onClick={() => setTab("report")} />
        </>
      )}
      {!d && <Center agent={{ seed: seedOf("missions"), accent: ACCENT }} title="Missions" sub="BRIEF IT · THE SWARM RESEARCHES" onClick={() => setTab("new")} />}
    </World>
  );
}
