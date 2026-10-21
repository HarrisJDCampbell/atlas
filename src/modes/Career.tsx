// Career as a world: the funnel as concentric rings. Wishlist outside, offer
// at the centre — every application is a dot on its stage's ring, so progress
// literally means moving inward. Handshake matches orbit outside as an
// incoming ring; the coach sits at the centre.

import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useState } from "react";
import { AgentCfg, api, Application, Opportunity, ResumeInfo } from "../api";
import AgentConsole from "../components/AgentConsole";
import { AgentState } from "../components/Avatar";
import HandshakeFeed, { APPS_CHANGED } from "../components/HandshakeFeed";
import { Center, cfgProfile, LauncherRing, Node, RingLabel, seedOf, Track, World } from "../components/rings";
import { TaskQueue, useTasks } from "../components/TaskQueue";
import { ErrorLine, Panel, StatusBadge } from "../components/ui";
import { timeAgo } from "../hooks";
import { pt } from "../lib/polar";
import { modeById } from "../modes";
import { DRILLS, Pipeline, STAGE_COLOR, STAGES } from "./CareerParts";

const ACCENT = modeById("career").accent;
// Inner = closer to an offer.
const STAGE_R: Record<string, number> = { offer: 150, interview: 192, oa: 234, applied: 276, wishlist: 318 };
const R = { incoming: 392 };

/** Starts a resume or outreach task for an opportunity (or a pasted posting). */
async function draftFor(kind: "resume" | "outreach", o: Opportunity | null, jobText: string, channel = "linkedin_note") {
  const what = o ? `${o.title} — ${o.employer}` : "pasted posting";
  const title = kind === "resume" ? `Resume for ${what}` : `${channel === "email" ? "Email" : "LinkedIn note"} · ${what}`;
  return api.createTask(kind, title, { opportunityId: o?.id ?? "", jobText, channel, recipient: "recruiter" });
}

function Selected({ o, done, drafted }: { o: Opportunity; done: () => void; drafted: () => void }) {
  const toPipeline = async () => {
    const apps = await api.applications();
    if (!apps.some((a) => a.link && a.link === o.link)) {
      await api.saveApplications([{ id: crypto.randomUUID(), company: o.employer, role: o.title, stage: "wishlist", link: o.link, note: o.reasons, updated: new Date().toISOString() }, ...apps]);
      window.dispatchEvent(new Event(APPS_CHANGED));
    }
    await api.setOpportunity(o.id, "added");
    done();
  };
  return (
    <section className="hud rise space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold">{o.title}</div>
          <div className="text-[12.5px] text-ink-2">{[o.employer, o.location, o.pay].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="display text-[28px] font-light" style={{ color: o.score >= 80 ? "#e0a700" : undefined }}>{o.score}</div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <StatusBadge status={o.eligible === "yes" ? "good" : o.eligible === "no" ? "critical" : "unknown"} label={o.eligible === "yes" ? "eligible" : o.eligible === "no" ? "not eligible" : "eligibility ?"} />
        <StatusBadge status="unknown" label={o.kind} />
        {o.deadline && <StatusBadge status="warning" label={`due ${o.deadline}`} />}
      </div>
      {o.reasons && <p className="text-[12.5px] text-ink-2">→ {o.reasons}</p>}
      {o.summary && <p className="text-[12px] text-ink-3">{o.summary}</p>}
      <p className="font-mono text-[10.5px] text-ink-4">from “{o.emailSubject}” · {timeAgo(o.received)}</p>
      <div className="rounded-lg border border-line p-2.5">
        <div className="label mb-2">Have an agent draft</div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => draftFor("resume", o, "").then(drafted)} className="rounded-md border border-line-2 px-2.5 py-1 text-[11.5px] hover:border-accent/60">Tailor resume</button>
          <button onClick={() => draftFor("outreach", o, "", "linkedin_note").then(drafted)} className="rounded-md border border-line-2 px-2.5 py-1 text-[11.5px] hover:border-accent/60">LinkedIn note</button>
          <button onClick={() => draftFor("outreach", o, "", "email").then(drafted)} className="rounded-md border border-line-2 px-2.5 py-1 text-[11.5px] hover:border-accent/60">Recruiter email</button>
        </div>
        <p className="mt-1.5 text-[10.5px] text-ink-4">Handshake emails carry only the title and summary. For real tailoring, paste the full description in Resume.</p>
      </div>
      <div className="flex gap-2">
        {o.status !== "added" && <button onClick={toPipeline} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-black">+ Add to pipeline</button>}
        {o.link && <button onClick={() => openUrl(o.link)} className="rounded-lg border border-line-2 px-3 py-1.5 text-xs">Open in Handshake ↗</button>}
        <button onClick={() => api.setOpportunity(o.id, "dismissed").then(done)} className="rounded-lg border border-line-2 px-3 py-1.5 text-xs text-ink-3">Dismiss</button>
      </div>
    </section>
  );
}

function ResumeTab({ drafted }: { drafted: () => void }) {
  const [info, setInfo] = useState<ResumeInfo | null>(null);
  const [jd, setJd] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.resumeInfo().then(setInfo).catch((e) => setErr(String(e))); }, []);
  const go = (kind: "resume" | "outreach", channel?: string) =>
    draftFor(kind, null, jd, channel).then(() => { setJd(""); drafted(); }).catch((e) => setErr(String(e)));
  return (
    <Panel title="Resume" meta={info?.exists ? `${info.words} words · imported ${timeAgo(info.updated)}` : "not imported"}>
      <div className="space-y-3">
        <p className="text-[12px] text-ink-3">Agents tailor from your real resume and project facts only. Anything they can't trace — a number, a tool, a story — is flagged, not written in.</p>
        <textarea value={jd} onChange={(e) => setJd(e.target.value)} rows={9} placeholder="Paste the full job description here…"
          className="selectable w-full resize-y rounded-lg border border-line-2 bg-surface-2 px-3 py-2 text-[12.5px] outline-none focus:border-accent/60" />
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => go("resume")} disabled={jd.trim().length < 80} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40">Tailor resume to this</button>
          <button onClick={() => go("outreach", "linkedin_note")} disabled={jd.trim().length < 80} className="rounded-lg border border-line-2 px-3 py-1.5 text-xs disabled:opacity-40">LinkedIn note</button>
          <button onClick={() => go("outreach", "email")} disabled={jd.trim().length < 80} className="rounded-lg border border-line-2 px-3 py-1.5 text-xs disabled:opacity-40">Recruiter email</button>
        </div>
        {info && <p className="font-mono text-[10.5px] text-ink-4">source: {info.path.replace(/^\/Users\/[^/]+/, "~")} · claims to verify: ~/.config/atlas/career/corrections.md</p>}
        <ErrorLine error={err} />
      </div>
    </Panel>
  );
}

export default function Career() {
  const [apps, setApps] = useState<Application[]>([]);
  const [feed, setFeed] = useState<Opportunity[]>([]);
  const [coach, setCoach] = useState<AgentCfg | null>(null);
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [tab, setTab] = useState(() => new URLSearchParams(location.search).get("tab") ?? "coach");
  const [state, setState] = useState<AgentState>("idle");

  const load = useCallback(() => {
    api.applications().then(setApps).catch(() => {});
    api.opportunities().then((f) => setFeed(f.items)).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    api.config().then(({ config }) => setCoach(config.agents.find((a) => a.id === "interview") ?? null)).catch(() => {});
    window.addEventListener(APPS_CHANGED, load);
    const un = api.onInboxEvent((e) => { if (e.stage === "done") load(); });
    return () => { window.removeEventListener(APPS_CHANGED, load); un.then((f) => f()); };
  }, [load]);

  const profile = coach ? cfgProfile(coach, ACCENT) : null;
  const { tasks } = useTasks(["resume", "outreach"]);
  const waitingDrafts = tasks.flatMap((t) => t.drafts).filter((d) => d.status === "review").length;
  const toDrafts = () => setTab("drafts");
  const incoming = feed.filter((o) => o.status === "new" || o.status === "saved").sort((a, b) => b.score - a.score).slice(0, 36);
  const strong = incoming.filter((o) => o.score >= 80).length;
  const active = apps.filter((a) => a.stage !== "rejected");

  const tabs = [
    { id: "coach", label: "Coach", node: profile && coach ? <AgentConsole key={profile.id} profile={profile} agentId={coach.id} onState={setState} suggestions={DRILLS.map((d) => d.text)} /> : <div className="text-xs text-ink-3">Loading…</div> },
    ...(selected ? [{ id: "selected", label: "Selected", node: <Selected o={selected} drafted={toDrafts} done={() => { setSelected(null); setTab("feed"); load(); }} /> }] : []),
    { id: "drafts", label: `Drafts ${waitingDrafts}`, node: <TaskQueue kinds={["resume", "outreach"]} empty="No drafts yet. Click a Handshake match on the ring, or paste a posting in Resume." /> },
    { id: "resume", label: "Resume", node: <ResumeTab drafted={toDrafts} /> },
    { id: "feed", label: "Handshake", node: <HandshakeFeed /> },
    { id: "pipeline", label: "Pipeline", node: <Pipeline /> },
  ];

  return (
    <World title="Career" crumbs={<span className="label">Career · inner rings are closer to an offer</span>} tabs={tabs} tab={tab} setTab={setTab}>
      <LauncherRing mode="career" color={ACCENT} />

      {/* incoming: Handshake matches */}
      <Track r={R.incoming} dashed />
      {incoming.map((o, i) => {
        const [x, y] = pt(R.incoming, (i / Math.max(1, incoming.length)) * 360);
        const col = o.score >= 80 ? "#e0a700" : o.score >= 50 ? "#8a6a10" : "#57564f";
        return (
          <Node key={o.id} x={x} y={y} r={5 + (o.score / 100) * 9} color={col} fill={0.75} glow={o.score >= 80}
            onClick={() => { setSelected(o); setTab("selected"); }}
            hover={{ title: `${o.score} · ${o.title}`, color: col, lines: [[o.employer, o.location, o.pay].filter(Boolean).join(" · "), o.reasons], hint: "click → details and actions" }} />
        );
      })}
      <RingLabel id="lbl-in" r={R.incoming + 26} text={`INCOMING · HANDSHAKE · ${strong} STRONG`} at={-30} />

      {/* the funnel */}
      {STAGES.filter((s) => s.id !== "rejected").map((s) => {
        const r = STAGE_R[s.id];
        const mine = active.filter((a) => a.stage === s.id);
        return (
          <g key={s.id}>
            <Track r={r} opacity={0.9} />
            <RingLabel id={`lbl-${s.id}`} r={r + 12} text={`${s.name.toUpperCase()} · ${mine.length}`} at={148} />
            {mine.map((a) => {
              const [x, y] = pt(r, seedOf(a.id) % 360);
              return <Node key={a.id} x={x} y={y} r={7} color={STAGE_COLOR[s.id]} fill={0.9} onClick={() => setTab("pipeline")}
                hover={{ title: a.company, color: STAGE_COLOR[s.id], lines: [`${a.role} · ${s.name}`, `updated ${timeAgo(a.updated)}`], hint: "click → pipeline" }} />;
            })}
          </g>
        );
      })}

      <Center agent={profile} state={state} title="Career" sub="INTERVIEW COACH"
        line={`${strong} STRONG · ${waitingDrafts} DRAFTS · ${active.filter((a) => a.stage !== "wishlist").length} IN FLIGHT`} onClick={() => setTab("coach")} />
    </World>
  );
}
