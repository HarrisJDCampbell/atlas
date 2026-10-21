import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, Envelope, MissionDetail, Reference } from "../api";
import { ErrorLine, Panel, Status, StatusBadge } from "../components/ui";

export const PHASES = [
  { id: "references", name: "References" },
  { id: "plan", name: "Plan" },
  { id: "research", name: "Research" },
  { id: "verify", name: "Verify" },
  { id: "write", name: "Write" },
];

export const STATUS_OF: Record<string, Status> = {
  running: "warning", done: "good", failed: "critical", cancelled: "unknown", interrupted: "serious", draft: "unknown",
};

export function NewMission({ created }: { created: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [refs, setRefs] = useState<Reference[]>([{ kind: "video", value: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const id = await api.createMission(title, brief, refs.filter((r) => r.value.trim()));
      await api.runMission(id);
      created(id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const field = "selectable w-full rounded-lg border border-line-2 bg-surface-2/70 px-3 py-2 text-[13.5px] outline-none placeholder:text-ink-4 focus:border-accent/60";
  return (
    <Panel title="New mission" meta="describe it like you'd brief a person" className="h-full overflow-y-auto">
      <div className="flex max-w-3xl flex-col gap-4">
        <label className="block">
          <span className="label">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Faceless sports-stats TikTok channel" className={`${field} mt-1.5`} />
        </label>
        <label className="block">
          <span className="label">Brief</span>
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={9}
            placeholder="What you want, what you already know, what you're unsure about, and what a good answer looks like. The more context, the better the questions the planner asks."
            className={`${field} mt-1.5 resize-y leading-relaxed`} />
        </label>
        <div>
          <span className="label">References</span>
          <p className="mt-1 text-[11px] text-ink-4">Videos are transcribed from their captions, pages are read, notes go in as-is. All of them become citable sources.</p>
          <div className="mt-2 flex flex-col gap-2">
            {refs.map((r, i) => (
              <div key={i} className="flex gap-2">
                <select value={r.kind} onChange={(e) => setRefs(refs.map((x, j) => j === i ? { ...x, kind: e.target.value as Reference["kind"] } : x))}
                  className="w-28 rounded-lg border border-line-2 bg-surface-2 px-2 font-mono text-[11px] uppercase text-ink-2 outline-none">
                  <option value="video">Video</option>
                  <option value="url">Page</option>
                  <option value="note">Note</option>
                </select>
                {r.kind === "note" ? (
                  <textarea value={r.value} rows={2} onChange={(e) => setRefs(refs.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                    placeholder="Anything you know that isn't online" className={`${field} flex-1`} />
                ) : (
                  <input value={r.value} onChange={(e) => setRefs(refs.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                    placeholder={r.kind === "video" ? "https://www.youtube.com/watch?v=…  or a TikTok link" : "https://…"} className={`${field} flex-1`} />
                )}
                <button onClick={() => setRefs(refs.filter((_, j) => j !== i))} className="px-2 text-ink-4 hover:text-critical" title="Remove">×</button>
              </div>
            ))}
            <button onClick={() => setRefs([...refs, { kind: "url", value: "" }])} className="self-start rounded-md border border-dashed border-line-2 px-3 py-1 text-[12px] text-ink-3 hover:text-ink-2">+ Add reference</button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={submit} disabled={busy || !title.trim() || !brief.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-black disabled:opacity-40">
            {busy ? "Launching…" : "Launch swarm"}
          </button>
          <span className="text-[11px] text-ink-4">Runs on your Mac. Expect 5–15 minutes; you can leave this page.</span>
        </div>
        <ErrorLine error={error} />
      </div>
    </Panel>
  );
}

export interface LiveAgent { agent: string; status: string; question: string; detail: string }

export function deriveLive(events: Envelope[]) {
  let phase = "";
  const agents = new Map<string, LiveAgent>();
  for (const { event: e } of events) {
    if (e.type === "phase") phase = e.phase;
    if (e.type === "agent") {
      const prev = agents.get(e.agent);
      const isQuestion = e.status === "queued" || e.status === "searching";
      agents.set(e.agent, {
        agent: e.agent,
        status: e.status,
        question: isQuestion ? e.detail : prev?.question ?? "",
        detail: isQuestion ? prev?.detail ?? "" : e.detail,
      });
    }
    if (e.type === "done") phase = "complete";
  }
  return { phase, agents: [...agents.values()] };
}

export const AGENT_STATUS: Record<string, Status> = { queued: "unknown", searching: "warning", working: "warning", citing: "warning", done: "good", failed: "critical" };

/** One mission's detail, kept live from the event stream. */
export function useMission(id: string | null) {
  const [d, setD] = useState<MissionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!id) { setD(null); return; }
    api.mission(id).then(setD).catch((e) => setError(String(e)));
  }, [id]);
  useEffect(load, [load]);
  useEffect(() => {
    if (!id) return;
    const un = api.onMissionEvent((env) => {
      if (env.missionId !== id) return;
      setD((prev) => prev ? { ...prev, events: [...prev.events, env] } : prev);
      if (["done", "error", "source", "finding"].includes(env.event.type)) load();
    });
    return () => { un.then((f) => f()); };
  }, [id, load]);
  return { d, error, load };
}

export function ReportView({ d }: { d: MissionDetail }) {
  return d.report
    ? <div className="prose-chat text-[13px]"><Markdown remarkPlugins={[remarkGfm]}>{d.report}</Markdown></div>
    : <div className="text-sm text-ink-3">{d.mission.status === "running" ? "The report is written after research and verification finish." : "No report yet."}</div>;
}

export function FindingsView({ d }: { d: MissionDetail }) {
  return (
    <div className="space-y-2">
      {d.findings.length === 0 && <div className="text-sm text-ink-3">No findings yet.</div>}
      {d.findings.map((f, i) => (
        <div key={i} className={`rounded-lg border px-3 py-2.5 ${f.verified ? "border-line bg-surface-2/40" : "border-critical/30 bg-critical/5"}`}>
          <div className="flex items-start gap-2">
            <StatusBadge status={f.verified ? "good" : "critical"} label={f.verified ? "verified" : "quote not on page"} />
            <span className="selectable text-[13px]">{f.claim}</span>
          </div>
          <div className="selectable mt-1.5 border-l-2 border-line-2 pl-3 text-[12px] italic text-ink-3">“{f.quote}”</div>
          <button onClick={() => openUrl(f.url)} className="mt-1 truncate font-mono text-[10.5px] text-accent hover:underline">{f.source ? `[${f.source}] ` : ""}{f.url}</button>
        </div>
      ))}
    </div>
  );
}

export function SourcesView({ d }: { d: MissionDetail }) {
  return (
    <div className="divide-y divide-line">
      {d.sources.map((s) => (
        <button key={s.n} onClick={() => openUrl(s.url)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-surface-2/50">
          <span className="w-7 text-right font-mono text-[11px] text-ink-3">{s.n}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-[13px]">{s.title}</span><span className="block truncate font-mono text-[10.5px] text-ink-4">{s.url}</span></span>
          {s.primary && <StatusBadge status="good" label="primary" />}
        </button>
      ))}
    </div>
  );
}

export function LogView({ d }: { d: MissionDetail }) {
  return (
    <div className="selectable space-y-0.5 font-mono text-[11px]">
      {d.events.map((env, i) => {
        const e = env.event;
        const text = e.type === "phase" ? `== ${e.phase}: ${e.detail}` : e.type === "agent" ? `${e.agent} ${e.status}: ${e.detail}`
          : e.type === "source" ? `+ source ${e.n} ${e.title}` : e.type === "finding" ? `${e.verified ? "✓" : "✗"} ${e.agent} ${e.claim}`
          : e.type === "log" ? `· ${e.text}` : e.type === "done" ? `== done: ${e.verified}/${e.total} verified, ${e.sources} sources` : `!! ${e.message}`;
        return <div key={i} className={e.type === "error" ? "text-critical" : e.type === "phase" || e.type === "done" ? "text-ink" : "text-ink-3"}><span className="text-ink-4">{env.at.slice(11, 19)}</span> {text}</div>;
      })}
    </div>
  );
}
