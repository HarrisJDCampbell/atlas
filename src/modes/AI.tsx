// AI as a world: Atlas at the centre, your configured agents around it as
// characters (click one to talk), installed models as planets that glow when
// loaded, and a memory gauge ring — the number that decides what can run.

import { useEffect, useState } from "react";
import { AgentCfg, AgentProfile, api } from "../api";
import AgentConsole from "../components/AgentConsole";
import { AgentState } from "../components/Avatar";
import { AgentNode, Center, cfgProfile, LauncherRing, Node, RingLabel, Track, World } from "../components/rings";
import { gb, Panel } from "../components/ui";
import { useData } from "../data";
import { usePoll } from "../hooks";
import { arc, pt } from "../lib/polar";
import { modeById } from "../modes";
import { Pending } from "../shell";

const ACCENT = modeById("ai").accent;
const R = { agents: 212, models: 322, memory: 398 };

export default function AI({ pending, consumed }: { pending?: Pending | null; consumed?: () => void }) {
  const { stats } = useData();
  const models = usePoll(api.models, 5_000);
  const [agents, setAgents] = useState<AgentCfg[]>([]);
  const [orch, setOrch] = useState<AgentProfile | null>(null);
  const [picked, setPicked] = useState<string>("chief");
  const [tab, setTab] = useState("chat");
  const [state, setState] = useState<AgentState>("idle");
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);
  // A prompt handed over from elsewhere (⌘K "Ask …"): pick that agent and send it.
  useEffect(() => {
    if (!pending) return;
    setPicked(pending.agentId);
    setTab("chat");
    setPrefill({ text: pending.text, nonce: pending.nonce });
    consumed?.();
  }, [pending, consumed]);
  useEffect(() => {
    api.config().then(({ config }) => setAgents(config.agents)).catch(() => {});
    api.orchestrator().then(setOrch).catch(() => {});
  }, []);

  const agent = agents.find((a) => a.id === picked) ?? agents[0];
  const ms = models.data ?? [];
  const loaded = ms.filter((m) => m.loadedVramBytes);
  const inModels = loaded.reduce((n, m) => n + (m.loadedVramBytes ?? 0), 0);
  const s = stats.data;
  const maxSize = Math.max(1, ...ms.map((m) => m.sizeBytes));

  const tabs = [
    { id: "chat", label: agent?.name ?? "Chat", node: agent ? <AgentConsole key={agent.id} profile={cfgProfile(agent, ACCENT)} agentId={agent.id} prefill={prefill} onState={setState} /> : <div className="text-xs text-ink-3">Loading…</div> },
    { id: "models", label: "Models", node: (
      <Panel title="Installed models">
        <div className="divide-y divide-line">
          {ms.map((m) => (
            <div key={m.name} className="flex items-center justify-between py-2 text-[12.5px]">
              <span className="font-mono">{m.name}{m.remote && <span className="ml-2 text-serious">cloud</span>}</span>
              <span className="num text-ink-3">{m.remote ? "—" : `${gb(m.sizeBytes)} GB`}{m.loadedVramBytes ? ` · loaded ${gb(m.loadedVramBytes)} GB` : ""}</span>
            </div>
          ))}
        </div>
      </Panel>
    ) },
  ];

  return (
    <World title="AI" crumbs={<span className="label">Agents · models · memory</span>} tabs={tabs} tab={tab} setTab={setTab}>
      <LauncherRing mode="ai" color={ACCENT} />

      {/* memory gauge: everything in use, and the models' share of it */}
      {s && (
        <g>
          <path d={arc(R.memory, 0, 359.9)} fill="none" stroke="var(--color-surface-3)" strokeWidth={8} />
          <path d={arc(R.memory, 0, Math.max(0.5, (s.memUsed / s.memTotal) * 359.9))} fill="none" stroke={s.memUsed / s.memTotal > 0.88 ? "var(--color-warning)" : "var(--color-ink-4)"} strokeWidth={8} />
          {inModels > 0 && <path d={arc(R.memory, 0, Math.max(0.5, (inModels / s.memTotal) * 359.9))} fill="none" stroke={ACCENT} strokeWidth={8} />}
          <RingLabel id="lbl-mem" r={R.memory + 22} text={`MEMORY · ${gb(s.memUsed)} / ${gb(s.memTotal)} GB IN USE · ${gb(inModels)} GB IN MODELS`} at={-34} />
        </g>
      )}

      {/* models */}
      <Track r={R.models} />
      {ms.map((m, i) => {
        const [x, y] = pt(R.models, (i / Math.max(1, ms.length)) * 360 + 20);
        const on = !!m.loadedVramBytes;
        const r = m.remote ? 12 : 10 + 16 * Math.sqrt(m.sizeBytes / maxSize);
        return (
          <Node key={m.name} x={x} y={y} r={r} color={m.remote ? "var(--color-serious)" : ACCENT} fill={on ? 0.45 : 0.12} glow={on}
            label={m.name.replace(":latest", "")} sub={m.remote ? "cloud" : on ? `${gb(m.loadedVramBytes!)} GB live` : `${gb(m.sizeBytes)} GB`}
            hover={{ title: m.name, lines: [m.remote ? "runs on ollama.com — prompts leave this Mac" : `${gb(m.sizeBytes)} GB on disk`, on ? `loaded now · ${gb(m.loadedVramBytes!)} GB in memory` : "not loaded"], color: ACCENT }}>
            {m.remote && <circle cx={x} cy={y} r={r + 5} fill="none" stroke="var(--color-serious)" strokeDasharray="3 4" />}
          </Node>
        );
      })}
      <RingLabel id="lbl-models" r={R.models + 46} text={`MODELS · ${loaded.length} LOADED`} at={150} />

      {/* agents */}
      <Track r={R.agents} />
      {agents.map((a, i) => {
        const [x, y] = pt(R.agents, (i / Math.max(1, agents.length)) * 360);
        const prof = cfgProfile(a, ACCENT);
        return (
          <AgentNode key={a.id} x={x} y={y} size={62} profile={prof} state={a.id === picked ? state : "idle"}
            label={a.name} sub={a.model} selected={a.id === picked} onClick={() => { setPicked(a.id); setTab("chat"); }}
            hover={{ title: a.name, color: ACCENT, lines: [a.role, `${a.model}${a.context_projects.length ? ` · sees ${a.context_projects.join(", ")}` : ""}`], hint: "click → talk to it" }} />
        );
      })}

      <Center agent={orch} state="idle" title="Agents" sub={`${agents.length} AGENTS · ${ms.filter((m) => !m.remote).length} LOCAL MODELS`}
        line={loaded.length ? `${loaded.map((m) => m.name).join(", ")} LOADED` : "NOTHING LOADED"} />
    </World>
  );
}
