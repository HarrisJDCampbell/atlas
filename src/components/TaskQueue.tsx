// The review queue: every draft an agent produced, its basis, what the checker
// flagged, and the one-click way out. Nothing is ever posted for you — approving
// opens the platform's composer pre-filled, or copies the text.

import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useState } from "react";
import { Account, api, Draft, Identity, Task } from "../api";
import { timeAgo } from "../hooks";
import { useLaunch } from "./launch";
import { ErrorLine, StatusBadge } from "./ui";

export function useTasks(kinds?: Task["kind"][]) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const load = useCallback(() => { api.tasks().then(setTasks).catch(() => {}); }, []);
  useEffect(() => {
    load();
    const un = api.onTaskEvent((t) => setTasks((ts) => {
      const i = ts.findIndex((x) => x.id === t.id);
      return i < 0 ? [t, ...ts] : ts.map((x) => (x.id === t.id ? t : x));
    }));
    return () => { un.then((f) => f()); };
  }, [load]);
  const mine = kinds ? tasks.filter((t) => kinds.includes(t.kind)) : tasks;
  return { tasks: mine, load, setTasks };
}

const CHANNEL: Record<string, { name: string; limit?: number; compose?: (t: string) => string; site?: string }> = {
  x: { name: "X", limit: 280, compose: (t) => `https://x.com/intent/post?text=${encodeURIComponent(t)}` },
  instagram: { name: "Instagram", limit: 2200 },
  tiktok: { name: "TikTok", limit: 2200 },
  youtube: { name: "YouTube title", limit: 100 },
  threads: { name: "Threads", limit: 500, compose: (t) => `https://www.threads.net/intent/post?text=${encodeURIComponent(t)}` },
  linkedin: { name: "LinkedIn", limit: 3000, site: "https://www.linkedin.com/feed/" },
  linkedin_note: { name: "LinkedIn note", limit: 300 },
  email: { name: "Email", limit: 1500 },
  resume: { name: "Resume" },
};

function DraftCard({ task, d, onChange, account, identity }: { task: Task; d: Draft; onChange: (t: Task) => void; account?: Account; identity?: Identity }) {
  const [text, setText] = useState(d.text);
  const [err, setErr] = useState<string | null>(null);
  const { notify } = useLaunch();
  const ch = CHANNEL[d.channel] ?? { name: d.channel };
  const len = text.length;
  const dirty = text !== d.text;
  const done = d.status === "used" || d.status === "rejected";

  const save = async (status?: Draft["status"]) => {
    try { onChange(await api.updateDraft(task.id, d.id, { text: dirty ? text : undefined, status })); }
    catch (e) { setErr(String(e)); }
  };
  const ship = async () => {
    // The account decides the route: post through its n8n workflow, hand off to
    // Metricool's planner, or fall back to the platform composer / clipboard.
    if (account?.route === "n8n" && identity) {
      try { await api.postVia(identity.id, account.id, text); } catch (e) { setErr(String(e)); return; }
      await save("used");
      notify(`Posted to ${ch.name}${account.handle ? ` as @${account.handle.replace(/^@/, "")}` : ""}`);
      return;
    }
    await save("used");
    if (account?.route === "metricool") {
      await api.copyText(text);
      await openUrl("https://app.metricool.com/planner");
      notify(`Copied — paste it into Metricool (${account.metricoolBrand || "your brand"}) and schedule`);
      return;
    }
    if (ch.compose) { await openUrl(ch.compose(text)); notify(`${ch.name} composer opened — review and post it yourself`); return; }
    await api.copyText(text);
    if (ch.site) await openUrl(ch.site);
    notify(`Copied${ch.site ? ` — paste it into ${ch.name}` : ""}`);
  };

  return (
    <div className={`rounded-lg border p-3 ${done ? "border-line opacity-55" : d.flags.length ? "border-warning/40 bg-warning/5" : "border-line bg-surface-2/40"}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="truncate text-[12px] font-medium text-ink-2">{d.label}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {ch.limit && <span className={`num font-mono text-[10.5px] ${len > ch.limit ? "text-critical" : "text-ink-4"}`}>{len}/{ch.limit}</span>}
          <StatusBadge status={d.status === "used" ? "good" : d.status === "rejected" ? "unknown" : d.flags.length ? "warning" : "good"}
            label={d.status === "review" ? (d.flags.length ? "check" : "clean") : d.status} />
        </span>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} disabled={done} rows={Math.min(10, Math.max(3, Math.ceil(text.length / 60)))}
        className="selectable w-full resize-y rounded-md border border-line-2 bg-bg/60 px-2.5 py-2 text-[13px] leading-relaxed outline-none focus:border-accent/60" />
      {d.basis && <div className="mt-1.5 truncate text-[11px] text-ink-4">based on: <span className="text-ink-3">“{d.basis}”</span></div>}
      {d.flags.map((f, i) => <div key={i} className="mt-1 text-[11.5px] text-warning">▲ {f}</div>)}
      {!done && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button onClick={ship} className="rounded-md bg-accent px-2.5 py-1 text-[11.5px] font-semibold text-black">
            {account?.route === "n8n" ? `Post now as ${identity?.name ?? ""}`
              : account?.route === "metricool" ? "Copy & open Metricool"
              : ch.compose ? `Open in ${ch.name} ↗` : ch.site ? `Copy & open ${ch.name}` : "Copy"}
          </button>
          {dirty && <button onClick={() => save()} className="rounded-md border border-line-2 px-2.5 py-1 text-[11.5px]">Save & re-check</button>}
          <button onClick={() => save("rejected")} className="rounded-md px-2 py-1 text-[11.5px] text-ink-3 hover:text-critical">Reject</button>
        </div>
      )}
      <ErrorLine error={err} />
    </div>
  );
}

export function TaskCard({ task, onChange, onDelete, identities = [] }: { task: Task; onChange: (t: Task) => void; onDelete: () => void; identities?: Identity[] }) {
  const identity = identities.find((i) => i.id === task.input.identity);
  const account = identity?.accounts.find((a) => a.id === task.input.account);
  return (
    <section className="hud rise p-3.5">
      <header className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold">{task.title}</div>
          <div className="font-mono text-[10.5px] text-ink-4">{task.kind} · {task.model} · {timeAgo(task.created)}</div>
        </div>
        <span className="flex items-center gap-1.5">
          <StatusBadge status={task.status === "failed" ? "critical" : task.status === "running" ? "warning" : task.status === "done" ? "good" : "unknown"} label={task.status} />
          {task.status !== "running" && <button onClick={onDelete} title="Remove" className="text-ink-4 hover:text-critical">×</button>}
        </span>
      </header>
      {task.status === "running" && <div className="space-y-0.5 font-mono text-[10.5px] text-ink-3">{task.log.map((l, i) => <div key={i}>· {l}</div>)}<div className="animate-pulse text-accent">working…</div></div>}
      {task.error && <ErrorLine error={task.error} />}
      <div className="space-y-2">{task.drafts.map((d) => <DraftCard key={d.id + d.status} task={task} d={d} onChange={onChange} account={account} identity={identity} />)}</div>
      {task.notes.length > 0 && (
        <div className="mt-2 rounded-md border border-line p-2.5">
          <div className="label mb-1">Honest gaps — for you to decide, not to fake</div>
          {task.notes.map((n, i) => <div key={i} className="text-[12px] text-ink-2">· {n.replace(/^gap: /, "")}</div>)}
        </div>
      )}
    </section>
  );
}

export function TaskQueue({ kinds, empty }: { kinds: Task["kind"][]; empty: string }) {
  const { tasks, setTasks } = useTasks(kinds);
  const [identities, setIdentities] = useState<Identity[]>([]);
  useEffect(() => { api.identities().then(setIdentities).catch(() => {}); }, []);
  const replace = (t: Task) => setTasks((ts) => ts.map((x) => (x.id === t.id ? t : x)));
  return (
    <div className="space-y-3">
      {tasks.length === 0 && <div className="rounded-lg border border-dashed border-line-2 p-4 text-center text-[12px] text-ink-3">{empty}</div>}
      {tasks.map((t) => <TaskCard key={t.id} task={t} identities={identities} onChange={replace} onDelete={() => api.deleteTask(t.id).then(() => setTasks((ts) => ts.filter((x) => x.id !== t.id)))} />)}
    </div>
  );
}
