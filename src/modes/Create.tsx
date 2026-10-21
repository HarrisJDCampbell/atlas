// Content as a world: the studio agent at the centre; your channels, then the
// projects you can post about, then the drafts waiting for you. Agents write
// from what you actually shipped; you edit, approve, and post it yourself.

import { useEffect, useState } from "react";
import { api, DirScan } from "../api";
import AgentConsole from "../components/AgentConsole";
import { AgentState } from "../components/Avatar";
import { Center, LauncherRing, Node, RingLabel, seedOf, Track, World } from "../components/rings";
import Accounts, { PLATFORMS, useIdentities } from "../components/Accounts";
import { TaskQueue, useTasks } from "../components/TaskQueue";
import { ErrorLine, Panel } from "../components/ui";
import { useData } from "../data";
import { pt } from "../lib/polar";
import { modeById } from "../modes";

const ACCENT = modeById("create").accent;
const R = { identities: 182, projects: 296, drafts: 390 };

function NewPost({ preset, created }: { preset: { identity: string; account: string; project: string; nonce: number }; created: () => void }) {
  const { projects } = useData();
  const { list } = useIdentities();
  const [identity, setIdentity] = useState(preset.identity);
  const [account, setAccount] = useState(preset.account);
  const [project, setProject] = useState(preset.project);
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setIdentity(preset.identity); setAccount(preset.account); setProject(preset.project); }, [preset.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const ident = list.find((i) => i.id === identity) ?? list[0];
  const acct = ident?.accounts.find((a) => a.id === account) ?? ident?.accounts[0];
  const go = async () => {
    if (!ident || !acct) return;
    setBusy(true); setErr(null);
    try {
      const p = projects.data?.find((x) => x.id === project);
      await api.createTask("post", `${PLATFORMS[acct.platform]?.name ?? acct.platform} · ${ident.name}${p ? ` · ${p.name}` : ""}${topic ? ` · ${topic}` : ""}`,
        { channel: acct.platform, project, topic, identity: ident.id, account: acct.id });
      setTopic("");
      created();
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  const field = "mt-1 w-full rounded-lg border border-line-2 bg-surface-2 px-3 py-2 text-[13px] outline-none";
  return (
    <Panel title="New post" meta="3 variants · in that identity's voice">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {list.map((i) => (
            <button key={i.id} onClick={() => { setIdentity(i.id); setAccount(i.accounts[0]?.id ?? ""); }}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] ${ident?.id === i.id ? "border-accent/70 bg-accent/10 text-ink" : "border-line-2 text-ink-3"}`}>
              <span className="h-2 w-2 rounded-full" style={{ background: i.accent }} />{i.name}
            </button>
          ))}
        </div>
        <label className="block"><span className="label">Account</span>
          <select value={acct?.id ?? ""} onChange={(e) => setAccount(e.target.value)} className={field}>
            {(ident?.accounts ?? []).map((a) => <option key={a.id} value={a.id}>{PLATFORMS[a.platform]?.name ?? a.platform}{a.handle ? ` · @${a.handle.replace(/^@/, "")}` : ""} — {a.route}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">About</span>
          <select value={project} onChange={(e) => setProject(e.target.value)} className={field}>
            <option value="">Everything {ident?.name ?? "it"} speaks about</option>
            {(projects.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} — recent commits & roadmap</option>)}
          </select>
        </label>
        <label className="block"><span className="label">Angle (optional)</span>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. the lesson in your words — or leave empty for a how-it-works post"
            className={`selectable ${field} focus:border-accent/60`} />
        </label>
        <button onClick={go} disabled={busy || !acct} className="w-full rounded-lg bg-accent py-2 text-[13px] font-semibold text-black disabled:opacity-50">
          {busy ? "Starting…" : acct ? `Draft for ${PLATFORMS[acct.platform]?.name ?? acct.platform}` : "Add an account first"}
        </button>
        <p className="text-[11px] text-ink-4">Every draft cites what it's built on; ungrounded numbers, tech or stories, and anything on {ident?.name ?? "the identity"}'s “never says” list, get flagged. Nothing posts until you click.</p>
        <ErrorLine error={err} />
      </div>
    </Panel>
  );
}

export default function Create() {
  const { projects } = useData();
  const { tasks } = useTasks(["post"]);
  const [tab, setTab] = useState(() => new URLSearchParams(location.search).get("tab") ?? "new");
  const [state, setState] = useState<AgentState>("idle");
  const [preset, setPreset] = useState({ identity: "personal", account: "", project: "", nonce: 0 });
  const { list: identities } = useIdentities();
  const [machine, setMachine] = useState<DirScan | null>(null);
  const contentProject = projects.data?.find((p) => p.id === "content");
  useEffect(() => { if (contentProject?.exists) api.dirScan(contentProject.path).then(setMachine).catch(() => {}); }, [contentProject?.path, contentProject?.exists]);

  const ps = [...(projects.data ?? [])].sort((a, b) => (b.git?.commits7d ?? 0) - (a.git?.commits7d ?? 0));
  const waiting = tasks.flatMap((t) => t.drafts.filter((d) => d.status === "review").map((d) => ({ t, d })));
  const running = tasks.filter((t) => t.status === "running").length;
  const start = (identity: string, account: string, project: string) => { setPreset((p) => ({ identity, account, project, nonce: p.nonce + 1 })); setTab("new"); };

  const tabs = [
    { id: "new", label: "New post", node: <NewPost preset={preset} created={() => setTab("queue")} /> },
    { id: "queue", label: `Queue ${waiting.length}`, node: <TaskQueue kinds={["post"]} empty="No drafts yet. Pick an identity or a project on the rings." /> },
    { id: "accounts", label: "Accounts", node: <Accounts /> },
    { id: "machine", label: "Machine", node: machine
        ? <AgentConsole key={machine.agent.id} profile={machine.agent} scope={machine.path} onState={setState} />
        : <div className="text-xs text-ink-3">The content machine folder isn't available.</div> },
  ];

  return (
    <World title="Content" crumbs={<span className="label">Content · drafts you approve, never auto-posted</span>} tabs={tabs} tab={tab} setTab={setTab}>
      <LauncherRing mode="create" color={ACCENT} />

      {/* drafts waiting for review */}
      <Track r={R.drafts} dashed />
      {waiting.map(({ t, d }, i) => {
        const [x, y] = pt(R.drafts, (i / Math.max(1, waiting.length)) * 360);
        const col = d.flags.length ? "var(--color-warning)" : "var(--color-good)";
        return <Node key={`${t.id}-${d.id}`} x={x} y={y} r={8} color={col} fill={0.8} onClick={() => setTab("queue")}
          hover={{ title: `${d.label}`, color: col, lines: [d.text.slice(0, 90) + (d.text.length > 90 ? "…" : ""), d.flags.length ? `▲ ${d.flags[0]}` : "clean"], hint: "click → review queue" }} />;
      })}
      <RingLabel id="lbl-drafts" r={R.drafts + 24} text={`WAITING FOR YOU · ${waiting.length}${running ? ` · ${running} WRITING` : ""}`} at={-30} />

      {/* projects you can post about */}
      <Track r={R.projects} />
      {ps.map((p, i) => {
        const [x, y] = pt(R.projects, (i / Math.max(1, ps.length)) * 360 + 25);
        const c7 = p.git?.commits7d ?? 0;
        return <Node key={p.id} x={x} y={y} r={11 + 13 * Math.sqrt(Math.min(c7, 40) / 40)} color={p.accent} fill={c7 ? 0.32 : 0.12} glow={c7 > 0}
          label={p.name} sub={c7 ? `${c7} this week` : undefined} onClick={() => start(preset.identity, preset.account, p.id)}
          hover={{ title: `Post about ${p.name}`, color: p.accent, lines: [p.tagline, c7 ? `${c7} commits this week to draw from` : "quiet this week — less to say"], hint: "click → draft a post about it" }} />;
      })}
      <RingLabel id="lbl-src" r={R.projects + 44} text="MATERIAL · WHAT YOU SHIPPED" at={150} />

      {/* identities, with their accounts as moons */}
      <Track r={R.identities} />
      {identities.map((ident, i) => {
        const a = 270 + (i / Math.max(1, identities.length)) * 360;
        const [x, y] = pt(R.identities, a);
        const n = waiting.filter((w) => w.t.input.identity === ident.id).length;
        return (
          <g key={ident.id}>
            <Node x={x} y={y} r={22} color={ident.accent} fill={0.28} glow label={ident.name} sub={n ? `${n} waiting` : ident.kind}
              onClick={() => start(ident.id, ident.accounts[0]?.id ?? "", preset.project)}
              hover={{ title: ident.name, color: ident.accent, lines: [ident.voice || "no voice set yet", `${ident.accounts.length} accounts · speaks about ${ident.projects.join(", ") || "nothing yet"}`], hint: "click → new post as this identity" }} />
            {ident.accounts.map((acc, k) => {
              // moons fan over the top of the planet so the label underneath stays clear
              const n = ident.accounts.length, ma = n < 2 ? 0 : -75 + (k / (n - 1)) * 150;
              const mx = x + 40 * Math.sin((ma * Math.PI) / 180), my = y - 40 * Math.cos((ma * Math.PI) / 180);
              const ready = acc.route === "metricool" || (acc.route === "n8n" && !!acc.n8nWorkflowId);
              const col = ready ? "var(--color-good)" : acc.route === "manual" ? "var(--color-ink-4)" : "var(--color-warning)";
              return <Node key={acc.id} x={mx} y={my} r={6.5} color={col} fill={0.8}
                onClick={() => start(ident.id, acc.id, preset.project)}
                hover={{ title: `${ident.name} · ${PLATFORMS[acc.platform]?.name ?? acc.platform}${acc.handle ? ` @${acc.handle.replace(/^@/, "")}` : ""}`, color: col,
                  lines: [acc.route === "n8n" ? (acc.n8nWorkflowId ? "posts via n8n" : "n8n not connected yet") : acc.route === "metricool" ? `via Metricool · ${acc.metricoolBrand}` : "manual — copy and paste"], hint: "click → post from this account" }} />;
            })}
          </g>
        );
      })}

      <Center agent={{ seed: seedOf("content-studio"), accent: ACCENT }} state={running ? "thinking" : state} title="Studio"
        sub="DRAFTS · YOU POST" line={waiting.length ? `${waiting.length} DRAFTS WAITING` : "PICK AN IDENTITY OR A PROJECT"} onClick={() => setTab("new")} />
    </World>
  );
}
