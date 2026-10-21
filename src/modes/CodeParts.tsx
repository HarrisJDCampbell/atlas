// The drawer beside the CODE world: today's set, a pattern's guide, Java drills,
// the toolkit and progress.

import { useEffect, useMemo, useState } from "react";
import { api, CodeOverview, CodeProblemSummary, DrillVerdict, DrillView, PatternGuide, ToolkitSection } from "../api";
import JavaEditor from "../components/code/JavaEditor";
import { bigO } from "../lib/bigo";
import { ErrorLine, Panel, Progress } from "../components/ui";

export type Open = (id: string, mode?: "practice" | "mock") => void;
const DIFF: Record<string, string> = { easy: "var(--color-good)", medium: "var(--color-warning)", hard: "var(--color-serious)" };

export const statusOf = (p: CodeProblemSummary) =>
  p.due ? { label: "due", color: "var(--color-warning)" }
  : p.progress.status === "solved" ? { label: "solved", color: "var(--color-good)" }
  : p.progress.status === "attempted" ? { label: "attempted", color: "var(--color-serious)" }
  : { label: "new", color: "var(--color-ink-4)" };

export function ProblemRow({ p, open, note }: { p: CodeProblemSummary; open: Open; note?: string }) {
  const s = statusOf(p);
  return (
    <button onClick={() => open(p.id)} className="flex w-full items-center gap-2.5 rounded-md border border-line px-2.5 py-2 text-left hover:border-accent/50">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: DIFF[p.difficulty] }} title={p.difficulty} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px]">{p.title}</span>
        <span className="block truncate font-mono text-[10.5px] text-ink-4">{note ?? `${p.pattern} · ${bigO(p.target)}`}</span>
      </span>
      <span className="font-mono text-[10.5px]" style={{ color: s.color }}>{s.label}</span>
    </button>
  );
}

/** A mock should be a problem you haven't seen, from where you're weakest. */
export function pickMock(o: CodeOverview): string | null {
  const weak = [...o.patterns].filter((s) => s.solved < s.total).sort((a, b) => a.mastery - b.mastery).map((s) => s.id);
  for (const pat of weak) {
    const p = o.problems.find((x) => x.pattern === pat && x.progress.status === "" && x.difficulty === "medium");
    if (p) return p.id;
  }
  return o.problems.find((x) => x.progress.status === "")?.id ?? o.problems[0]?.id ?? null;
}

export function Today({ o, open, toDrills }: { o: CodeOverview; open: Open; toDrills: () => void }) {
  const byId = (id: string) => o.problems.find((p) => p.id === id);
  const mockId = pickMock(o);
  return (
    <div className="space-y-3">
      {!o.java && <div className="rounded-lg border border-critical/50 bg-critical/5 p-3 text-[12.5px] text-ink-2">No JDK found, so nothing can be judged. Install one: <code className="font-mono">brew install openjdk@17</code></div>}
      <div className="grid grid-cols-3 gap-2">
        {[
          { k: "Streak", v: `${o.streak}d`, sub: o.practicedToday ? "today counts" : o.streak ? "practice to keep it" : "start today" },
          { k: "Solved", v: `${o.solved}/${o.problems.length}`, sub: "problems" },
          { k: "Drills", v: `${o.drillsCorrect}/${o.drillsTotal}`, sub: "Java gotchas" },
        ].map((m) => (
          <div key={m.k} className="hud p-2.5">
            <div className="label">{m.k}</div>
            <div className="display mt-0.5 text-[20px] font-semibold">{m.v}</div>
            <div className="font-mono text-[10px] text-ink-4">{m.sub}</div>
          </div>
        ))}
      </div>
      <Panel title="Today's set" meta="reviews first, then something new">
        <div className="space-y-1.5">
          {o.plan.due.map((id) => byId(id) && <ProblemRow key={id} p={byId(id)!} open={open} note={`review · last solved ${byId(id)!.progress.lastSolved?.slice(0, 10) ?? ""}`} />)}
          {o.plan.next && byId(o.plan.next) && <ProblemRow p={byId(o.plan.next)!} open={open} note={o.plan.nextReason} />}
          {o.plan.drills.length > 0 && (
            <button onClick={toDrills} className="flex w-full items-center justify-between rounded-md border border-line px-2.5 py-2 text-left hover:border-accent/50">
              <span><span className="block text-[13px]">{o.plan.drills.length} Java drills</span><span className="block font-mono text-[10.5px] text-ink-4">what does this print? · two minutes</span></span>
              <span className="font-mono text-[10.5px] text-ink-3">→</span>
            </button>
          )}
          {o.plan.due.length === 0 && !o.plan.next && <p className="text-[12px] text-ink-3">Nothing due and nothing new left. Run a mock.</p>}
        </div>
      </Panel>
      <Panel title="Mock interview" meta="45 min · scored">
        <p className="text-[12.5px] text-ink-3">A problem you haven't seen, picked from your weakest pattern. The interviewer talks, and you think out loud. At the end, correctness, speed and Java quality are measured by the judge. Communication and problem solving are scored from what you actually said.</p>
        <button disabled={!mockId || !o.java} onClick={() => mockId && open(mockId, "mock")} className="mt-2.5 w-full rounded-lg bg-accent py-2 text-[13px] font-semibold text-black disabled:opacity-50">Start a mock interview</button>
      </Panel>
    </div>
  );
}

export function PatternPanel({ g, o, open }: { g: PatternGuide | undefined; o: CodeOverview; open: Open }) {
  const [shown, setShown] = useState<string | null>(null);
  if (!g) return <p className="text-[12px] text-ink-3">Pick a pattern on the inner ring.</p>;
  const ps = o.problems.filter((p) => p.pattern === g.id);
  const st = o.patterns.find((s) => s.id === g.id);
  return (
    <div className="space-y-3">
      <Panel title={g.name} meta={st ? `${st.solved}/${st.total} solved · ${Math.round(st.mastery * 100)}% mastery` : undefined}>
        <p className="text-[12.5px] leading-relaxed text-ink-2">{g.idea}</p>
        <div className="label mb-1 mt-3">You should think of this when you read…</div>
        {g.signals.map((s, i) => <div key={i} className="text-[12px] text-ink-2">· {s}</div>)}
        <div className="mt-2 font-mono text-[11px] text-ink-3">{g.complexity}</div>
      </Panel>
      <Panel title="The shape to know cold" meta="write it from memory">
        {/* The template often is a problem's answer, so it waits until you've tried one. */}
        {shown === g.id || (st && st.solved > 0)
          ? <div className="h-[300px] overflow-hidden rounded-md border border-line bg-bg/60"><JavaEditor value={g.skeleton} onChange={() => {}} readOnly /></div>
          : <div className="rounded-md border border-dashed border-line-2 p-3 text-[12px] text-ink-3">
              The template is close to the answer for {ps[0]?.title ?? "the first problem"}. Solve one of these first, then learn the general shape.
              <button onClick={() => setShown(g.id)} className="mt-2 block font-mono text-[11px] text-ink-2 underline decoration-dotted">show it anyway</button>
            </div>}
      </Panel>
      <Panel title="Where people slip">
        {g.pitfalls.map((s, i) => <div key={i} className="mb-1 text-[12px] text-ink-2">▲ {s}</div>)}
      </Panel>
      <Panel title="Problems">
        <div className="space-y-1.5">{ps.map((p) => <ProblemRow key={p.id} p={p} open={open} />)}</div>
      </Panel>
    </div>
  );
}

export function Drills({ refresh }: { refresh: () => void }) {
  const [list, setList] = useState<DrillView[]>([]);
  const [topic, setTopic] = useState<string>("all");
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState("");
  const [verdict, setVerdict] = useState<DrillVerdict | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.codeDrills().then(setList).catch((e) => setErr(String(e))); }, []);

  const topics = useMemo(() => [...new Set(list.map((d) => d.topic))], [list]);
  // Unanswered and missed drills first.
  const queue = useMemo(() => list.filter((d) => topic === "all" || d.topic === topic).sort((a, b) => Number(a.correct) - Number(b.correct)), [list, topic]);
  const d = queue[i % Math.max(1, queue.length)];

  const check = async () => {
    if (!d || verdict) return;
    try {
      const v = await api.codeDrillAnswer(d.id, answer);
      setVerdict(v);
      setList((l) => l.map((x) => (x.id === d.id ? { ...x, attempts: x.attempts + 1, correct: x.correct || v.correct } : x)));
      refresh();
    } catch (e) { setErr(String(e)); }
  };
  const next = () => { setVerdict(null); setAnswer(""); setI((x) => x + 1); };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {["all", ...topics].map((t) => {
          const ds = list.filter((x) => t === "all" || x.topic === t);
          return (
            <button key={t} onClick={() => { setTopic(t); setI(0); setVerdict(null); setAnswer(""); }}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] ${topic === t ? "border-accent/70 bg-accent/10 text-ink" : "border-line-2 text-ink-3"}`}>
              {t} <span className="text-ink-4">{ds.filter((x) => x.correct).length}/{ds.length}</span>
            </button>
          );
        })}
      </div>
      {d ? (
        <Panel title={d.title} meta={`${d.topic} · ${d.difficulty}${d.correct ? " · ✓ got it before" : d.attempts ? " · missed before" : ""}`}>
          <div className="h-[260px] overflow-hidden rounded-md border border-line bg-bg/60"><JavaEditor key={d.id} value={d.code} onChange={() => {}} readOnly /></div>
          <label className="mt-3 block"><span className="label">What does it print? Exactly, one line per println</span>
            <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} disabled={!!verdict}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); verdict ? next() : void check(); } }}
              className="selectable mt-1 w-full resize-none rounded-md border border-line-2 bg-bg/60 px-2.5 py-2 font-mono text-[12.5px] outline-none focus:border-accent/60" />
          </label>
          {verdict && (
            <div className={`mt-2 rounded-md border p-2.5 ${verdict.correct ? "border-good/40 bg-good/5" : "border-critical/40 bg-critical/5"}`}>
              <div className={`text-[12.5px] font-medium ${verdict.correct ? "text-good" : "text-critical"}`}>
                {verdict.correct ? (verdict.formatOnly ? "✓ Right — but match the spacing exactly next time:" : "✓ Right") : "✗ Java actually prints:"}
              </div>
              {(!verdict.correct || verdict.formatOnly) && <pre className="selectable mt-1 font-mono text-[12px] text-ink">{verdict.output}</pre>}
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{verdict.explanation}</p>
            </div>
          )}
          <div className="mt-2 flex gap-2">
            {!verdict
              ? <button onClick={check} className="flex-1 rounded-lg bg-accent py-1.5 text-[12.5px] font-semibold text-black">Check <span className="opacity-60">⌘↵</span></button>
              : <button onClick={next} className="flex-1 rounded-lg bg-accent py-1.5 text-[12.5px] font-semibold text-black">Next <span className="opacity-60">⌘↵</span></button>}
            {!verdict && <button onClick={next} className="rounded-lg border border-line-2 px-3 text-[12px] text-ink-3">Skip</button>}
          </div>
          <p className="mt-2 text-[10.5px] text-ink-4">Every expected output was captured by running the drill on a real JDK 17, not written by hand.</p>
        </Panel>
      ) : <p className="text-[12px] text-ink-3">No drills found.</p>}
      <ErrorLine error={err} />
    </div>
  );
}

export function Toolkit() {
  const [secs, setSecs] = useState<ToolkitSection[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { api.codeToolkit().then((s) => { setSecs(s); setOpen(s[0]?.title ?? null); }).catch(() => {}); }, []);
  return (
    <div className="space-y-2">
      <p className="text-[11.5px] text-ink-4">The Java you should be able to type without looking. In an interview you won't have this page, so use it to learn the API, not to lean on.</p>
      {secs.map((s) => (
        <section key={s.title} className="hud overflow-hidden">
          <button onClick={() => setOpen(open === s.title ? null : s.title)} className="flex w-full items-center justify-between px-3 py-2 text-left">
            <span className="text-[13px] font-medium">{s.title}</span><span className="font-mono text-[10.5px] text-ink-4">{s.items.length}</span>
          </button>
          {open === s.title && (
            <div className="space-y-2 border-t border-line p-3">
              {s.items.map((it) => (
                <div key={it.name}>
                  <div className="text-[12px] font-medium text-ink-2">{it.name}</div>
                  <pre className="selectable mt-0.5 overflow-x-auto rounded-md border border-line bg-bg/60 p-2 font-mono text-[11.5px] text-ink">{it.code}</pre>
                  {it.note && <div className="mt-0.5 text-[11px] text-ink-3">{it.note}</div>}
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

export function ProgressPanel({ o, guides }: { o: CodeOverview; guides: PatternGuide[] }) {
  const name = (id: string) => guides.find((g) => g.id === id)?.name ?? id;
  return (
    <div className="space-y-3">
      <Panel title="Pattern mastery" meta="solved and not overdue">
        <div className="space-y-2">
          {o.patterns.map((s) => (
            <div key={s.id}>
              <div className="flex justify-between text-[12px]"><span className="text-ink-2">{name(s.id)}</span><span className="num font-mono text-[11px] text-ink-3">{s.solved}/{s.total}{s.due ? ` · ${s.due} due` : ""}</span></div>
              <Progress done={Math.round(s.mastery * 100)} total={100} color="var(--accent)" height={5} />
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Recent attempts">
        {o.recent.length === 0 && <p className="text-[12px] text-ink-3">Nothing yet.</p>}
        {o.recent.map((a, i) => (
          <div key={i} className="flex items-center gap-2 border-t border-line py-1.5 text-[12px] first:border-0">
            <span className={a.solved ? (a.verdict === "slow" || a.verdict === "timeout" ? "text-warning" : "text-good") : "text-critical"}>{a.solved ? (a.verdict === "slow" || a.verdict === "timeout" ? "▲" : "✓") : "✗"}</span>
            <span className="min-w-0 flex-1 truncate text-ink-2">{a.title}{a.mock && <span className="ml-1 font-mono text-[10px] text-accent">mock</span>}</span>
            <span className="font-mono text-[10.5px] text-ink-4">{a.compiled ? `${a.cases}/${a.total}` : "no compile"}{a.slope != null ? ` · n^${a.slope.toFixed(1)}` : ""}{a.hints ? ` · ${a.hints} hint${a.hints > 1 ? "s" : ""}` : ""}</span>
          </div>
        ))}
      </Panel>
      <Panel title="Mock interviews">
        {o.mocks.length === 0 && <p className="text-[12px] text-ink-3">None yet. One a week is a good rhythm.</p>}
        {o.mocks.map((m) => (
          <div key={m.id} className="flex items-center gap-2 border-t border-line py-1.5 text-[12px] first:border-0">
            <span className="display w-9 text-[15px] font-semibold text-accent">{m.overall.toFixed(1)}</span>
            <span className="min-w-0 flex-1 truncate text-ink-2">{m.title}</span>
            <span className="font-mono text-[10.5px] text-ink-4">{m.at.slice(0, 10)} · comm {m.communication.score}/4</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}
