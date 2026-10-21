// Flows: n8n as a world. The operator at the centre; anything waiting on your
// decision closest to it; your workflows as planets; their recent runs as blips.
// n8n holds the integrations and schedules — Atlas holds the agents and the gate.

import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useState } from "react";
import { api, Approval, N8nStatus, Note } from "../api";
import { Center, LauncherRing, Node, RingLabel, seedOf, Track, World } from "../components/rings";
import { useLaunch } from "../components/launch";
import { ErrorLine, Panel, StatusBadge } from "../components/ui";
import { timeAgo } from "../hooks";
import { pt } from "../lib/polar";
import { modeById } from "../modes";
import { useShell } from "../shell";

const ACCENT = modeById("flows").accent;
const R = { approvals: 172, workflows: 282, runs: 380 };
const RUN_COLOR: Record<string, string> = { success: "var(--color-good)", error: "var(--color-critical)", crashed: "var(--color-critical)", waiting: "var(--color-warning)", running: "var(--color-warning)" };
const LIMIT: Record<string, number> = { x: 280, threads: 500, linkedin_note: 300 };

function ApprovalCard({ a, done }: { a: Approval; done: () => void }) {
  const [text, setText] = useState(a.text);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const decide = async (approve: boolean) => {
    setBusy(true); setErr(null);
    try { await api.decide(a.id, approve, text); done(); } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  const pending = a.status === "pending";
  return (
    <section className={`hud rise p-3.5 ${pending ? "" : "opacity-60"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold">{a.title}</div>
          <div className="truncate font-mono text-[10.5px] text-ink-4">{a.workflow} · {timeAgo(a.created)}</div>
        </div>
        <StatusBadge status={pending ? "warning" : a.status === "approved" ? "good" : a.status === "failed" ? "critical" : "unknown"} label={a.status} />
      </div>
      {a.summary && <p className="mt-1.5 text-[12px] text-ink-2">{a.summary}</p>}
      {(a.text || pending) && (
        <textarea value={text} onChange={(e) => setText(e.target.value)} disabled={!pending} rows={Math.min(8, Math.max(3, Math.ceil(text.length / 60)))}
          className="selectable mt-2 w-full resize-y rounded-md border border-line-2 bg-bg/60 px-2.5 py-2 text-[13px] outline-none focus:border-accent/60" />
      )}
      {LIMIT[a.channel] && <div className={`num font-mono text-[10.5px] ${text.length > LIMIT[a.channel] ? "text-critical" : "text-ink-4"}`}>{text.length}/{LIMIT[a.channel]}</div>}
      {a.flags.map((f, i) => <div key={i} className="mt-1 text-[11.5px] text-warning">▲ {f}</div>)}
      {a.error && <div className="mt-1 text-[11.5px] text-critical">{a.error}</div>}
      {pending && (
        <div className="mt-2 flex gap-1.5">
          <button onClick={() => decide(true)} disabled={busy} className="rounded-md bg-accent px-3 py-1 text-[12px] font-semibold text-black disabled:opacity-50">Approve{text !== a.text ? " with edits" : ""}</button>
          <button onClick={() => decide(false)} disabled={busy} className="rounded-md border border-line-2 px-3 py-1 text-[12px] text-ink-3 hover:text-critical">Reject</button>
        </div>
      )}
      <ErrorLine error={err} />
    </section>
  );
}

function Setup({ status, refresh }: { status: N8nStatus | null; refresh: () => void }) {
  const { openSettings } = useShell();
  const [msg, setMsg] = useState<string | null>(null);
  const install = (force: boolean) => api.n8nInstall(force).then((r) => { setMsg(r.length ? `Installed: ${r.join(", ")}` : "Templates already installed."); refresh(); }).catch((e) => setMsg(String(e)));
  const step = (ok: boolean, text: React.ReactNode) => (
    <li className="flex gap-2"><span className={ok ? "text-good" : "text-ink-4"}>{ok ? "✓" : "○"}</span><span>{text}</span></li>
  );
  return (
    <Panel title="Setup">
      <ol className="space-y-2 text-[12.5px] text-ink-2">
        {step(!!status?.reachable, <>n8n runs locally in Docker at <span className="font-mono">localhost:5678</span>, bound to this Mac only.</>)}
        {step(true, <>Atlas's API listens on <span className="font-mono">127.0.0.1:47321</span>; n8n already has its token.</>)}
        {step((status?.workflows.filter((w) => w.atlas).length ?? 0) >= 4, <>Starter workflows installed (inactive). <button onClick={() => install(false)} className="text-accent hover:underline">Install</button></>)}
        {step(false, <>Open n8n once and create the local owner account — <button onClick={() => openUrl("http://localhost:5678/")} className="text-accent hover:underline">open n8n</button>. That account lives only on this Mac.</>)}
        {step(!!status?.hasKey, <>Create an n8n API key (n8n → Settings → n8n API) and add it in <button onClick={openSettings} className="text-accent hover:underline">Settings</button> — lets Atlas switch workflows on and off.</>)}
        {step(false, <>Connect the accounts a workflow needs inside n8n (e.g. X on “Approve, then post to X”). Those sign-ins stay in n8n.</>)}
      </ol>
      <div className="mt-3 rounded-lg border border-line p-3 text-[11.5px] text-ink-3">
        <div className="label mb-1">Ground rules</div>
        Outward steps (posting, sending) pause in a Wait node and come here first. LinkedIn messaging and posting stay manual — LinkedIn bans automation tools. Atlas never auto-applies to jobs.
      </div>
      {msg && <p className="mt-2 text-[12px] text-ink-2">{msg}</p>}
    </Panel>
  );
}

export default function Flows() {
  const [status, setStatus] = useState<N8nStatus | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tab, setTab] = useState(() => new URLSearchParams(location.search).get("tab") ?? "approvals");
  const [running, setRunning] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { notify } = useLaunch();

  const load = useCallback(() => {
    api.n8n().then(setStatus).catch((e) => setErr(String(e)));
    api.approvals().then(setApprovals).catch(() => {});
    api.notes().then(setNotes).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(load, 20_000);
    const a = api.onApproval(() => load());
    const b = api.onNotify(() => load());
    return () => { clearInterval(id); a.then((f) => f()); b.then((f) => f()); };
  }, [load]);

  const run = async (id: string, name: string) => {
    setRunning(id); setErr(null);
    try { await api.n8nRun(id); notify(`Ran ${name}`); } catch (e) { setErr(String(e)); } finally { setRunning(null); load(); }
  };
  const toggle = (id: string, active: boolean) => api.n8nSetActive(id, active).then(load).catch((e) => setErr(String(e)));

  const pending = approvals.filter((a) => a.status === "pending");
  const wfs = status?.workflows ?? [];
  const runs = status?.executions ?? [];
  const active = wfs.filter((w) => w.active).length;

  const tabs = [
    { id: "approvals", label: `Approvals ${pending.length}`, node: (
      <div className="space-y-3">
        {approvals.length === 0 && <div className="rounded-lg border border-dashed border-line-2 p-4 text-center text-[12px] text-ink-3">Nothing waiting. When a workflow reaches a step that goes out into the world, it pauses here for you.</div>}
        {approvals.map((a) => <ApprovalCard key={a.id + a.status} a={a} done={load} />)}
      </div>
    ) },
    { id: "workflows", label: "Workflows", node: (
      <Panel title="Workflows" meta={status ? `${wfs.length} · ${active} active · via ${status.via || "—"}` : undefined}>
        <div className="divide-y divide-line">
          {wfs.map((w) => (
            <div key={w.id} className="flex items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-[13px]">{w.name}</div>
                <div className="font-mono text-[10.5px] text-ink-4">{w.active ? "active" : "inactive"}{w.updated ? ` · edited ${timeAgo(w.updated)}` : ""}</div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button onClick={() => run(w.id, w.name)} disabled={!!running} className="rounded-md border border-line-2 px-2 py-1 text-[11px] disabled:opacity-40">{running === w.id ? "Running…" : "Run now"}</button>
                {status?.hasKey && <button onClick={() => toggle(w.id, !w.active)} className={`rounded-md px-2 py-1 text-[11px] ${w.active ? "bg-accent text-black" : "border border-line-2"}`}>{w.active ? "On" : "Off"}</button>}
                <button onClick={() => openUrl(`http://localhost:5678/workflow/${w.id}`)} className="rounded-md border border-line-2 px-2 py-1 text-[11px]">↗</button>
              </div>
            </div>
          ))}
        </div>
        {!status?.hasKey && <p className="mt-2 text-[11px] text-ink-4">Add an n8n API key in Settings to switch workflows on and off from here.</p>}
      </Panel>
    ) },
    { id: "inbox", label: "Inbox", node: (
      <div className="space-y-2">
        {notes.map((n, i) => (
          <section key={i} className="hud rise p-3.5">
            <div className="flex items-baseline justify-between gap-2"><span className="text-[13px] font-semibold">{n.title}</span><span className="font-mono text-[10.5px] text-ink-4">{timeAgo(n.at)}</span></div>
            <div className="font-mono text-[10.5px] text-ink-4">{n.source}</div>
            {n.body && <p className="selectable mt-1.5 whitespace-pre-wrap text-[12.5px] text-ink-2">{n.body}</p>}
          </section>
        ))}
      </div>
    ) },
    { id: "setup", label: "Setup", node: <Setup status={status} refresh={load} /> },
  ];

  return (
    <World title="Flows" crumbs={<span className="label">Flows · n8n is the hands, Atlas is the gate</span>} tabs={tabs} tab={tab} setTab={setTab}>
      <LauncherRing mode="flows" color={ACCENT} />

      {/* recent runs */}
      <Track r={R.runs} dashed />
      {runs.map((x, i) => {
        const [px, py] = pt(R.runs, (i / Math.max(1, runs.length)) * 360);
        const col = RUN_COLOR[x.status] ?? "var(--color-ink-4)";
        const wf = wfs.find((w) => w.id === x.workflowId);
        return <Node key={x.id} x={px} y={py} r={5.5} color={col} fill={0.85}
          hover={{ title: wf?.name ?? x.workflowId, color: col, lines: [`${x.status} · ${x.mode}`, timeAgo(x.started)] }} />;
      })}
      <RingLabel id="lbl-runs" r={R.runs + 24} text={status?.hasKey ? `RECENT RUNS · ${runs.length}` : "RUN HISTORY NEEDS AN N8N API KEY"} at={-30} />

      {/* workflows */}
      <Track r={R.workflows} />
      {wfs.map((w, i) => {
        const [x, y] = pt(R.workflows, (i / Math.max(1, wfs.length)) * 360 + 20);
        const label = w.name.replace(/^Atlas · /, "");
        return <Node key={w.id} x={x} y={y} r={w.atlas ? 18 : 14} color={ACCENT} fill={w.active ? 0.45 : 0.12} glow={w.active}
          label={label.length > 24 ? `${label.slice(0, 23)}…` : label} sub={w.active ? "on" : undefined}
          onClick={() => setTab("workflows")}
          hover={{ title: w.name, color: ACCENT, lines: [w.active ? "active — runs on its trigger" : "inactive — Run now, or switch it on", w.atlas ? "an Atlas template" : "your workflow"], hint: "click → workflows" }} />;
      })}
      <RingLabel id="lbl-wf" r={R.workflows + 44} text={`WORKFLOWS · ${active} ACTIVE OF ${wfs.length}`} at={215} />

      {/* waiting on you */}
      <Track r={R.approvals} />
      {pending.map((a, i) => {
        const [x, y] = pt(R.approvals, (i / Math.max(1, pending.length)) * 360);
        return <Node key={a.id} x={x} y={y} r={10} color="var(--color-warning)" fill={0.7} glow onClick={() => setTab("approvals")}
          hover={{ title: a.title, color: "var(--color-warning)", lines: [a.workflow, a.text.slice(0, 80)], hint: "click → approve or reject" }} />;
      })}

      <Center agent={{ seed: seedOf("n8n-operator"), accent: ACCENT }} state={running ? "thinking" : "idle"} title="Flows"
        sub={status?.reachable ? "N8N · THE HANDS" : "N8N OFFLINE"}
        line={pending.length ? `${pending.length} WAITING ON YOU` : `${active} ACTIVE FLOW${active === 1 ? "" : "S"}`} onClick={() => setTab(pending.length ? "approvals" : "setup")} />
      {err && <text x={500} y={980} textAnchor="middle" fill="var(--color-critical)" fontSize={12}>{err.slice(0, 120)}</text>}
    </World>
  );
}
