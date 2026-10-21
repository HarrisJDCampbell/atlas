// Where you solve: statement and hints, a Java editor, the judge's results, and the
// interviewer. Practice counts up; a mock interview counts down from 45:00 and ends
// in a scorecard.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { api, ChatMsg, ProblemView, Reveal, RunResult, Scorecard } from "../../api";
import { useLaunch } from "../launch";
import { ErrorLine } from "../ui";
import Interviewer, { InterviewerHandle } from "./Interviewer";
import JavaEditor, { EditorHandle, Mark } from "./JavaEditor";
import Results from "./Results";

const MOCK_SECS = 45 * 60;
const DIFF_COLOR: Record<string, string> = { easy: "var(--color-good)", medium: "var(--color-warning)", hard: "var(--color-serious)" };
export { bigO } from "../../lib/bigo";
import { bigO } from "../../lib/bigo";
const clock = (s: number) => `${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, "0")}`;

function ScoreRow({ name, s, computed }: { name: string; s: { score: number; why: string; evidence: string }; computed: boolean }) {
  return (
    <div className="border-t border-line py-2.5">
      <div className="flex items-center gap-2">
        <span className="w-32 text-[12.5px] font-medium">{name}</span>
        <span className="flex gap-1">{[1, 2, 3, 4].map((i) => <span key={i} className="h-2 w-5 rounded-full" style={{ background: i <= s.score ? "var(--accent)" : "var(--color-surface-3)" }} />)}</span>
        <span className="num font-mono text-[11px] text-ink-3">{s.score}/4</span>
        <span className="ml-auto font-mono text-[10px] text-ink-4">{computed ? "measured" : "from the transcript"}</span>
      </div>
      <div className="mt-1 text-[12px] text-ink-2">{s.why}</div>
      {s.evidence && <div className="mt-0.5 text-[11.5px] italic text-ink-3">“{s.evidence}”</div>}
    </div>
  );
}

export function ScorecardView({ card, close }: { card: Scorecard; close: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 py-[6vh] backdrop-blur-sm" onMouseDown={close}>
      <div className="hud rise w-[640px] max-w-[92vw] p-5" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between">
          <div>
            <div className="label">Mock interview · scorecard</div>
            <div className="mt-1 text-[18px] font-semibold">{card.title}</div>
            <div className="font-mono text-[11px] text-ink-3">{clock(card.elapsedSecs)} used · {new Date(card.at).toLocaleString()}</div>
          </div>
          <div className="text-right"><div className="display text-[34px] font-semibold text-accent">{card.overall.toFixed(1)}</div><div className="font-mono text-[10px] text-ink-4">OUT OF 4</div></div>
        </div>
        <div className="mt-3">
          <ScoreRow name="Correctness" s={card.correctness} computed />
          <ScoreRow name="Efficiency" s={card.efficiency} computed />
          <ScoreRow name="Java quality" s={card.codeQuality} computed />
          <ScoreRow name="Communication" s={card.communication} computed={false} />
          <ScoreRow name="Problem solving" s={card.problemSolving} computed={false} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4 text-[12.5px]">
          <div><div className="label mb-1">Strengths</div>{card.strengths.map((s, i) => <div key={i} className="text-ink-2">+ {s}</div>)}</div>
          <div><div className="label mb-1">Work on</div>{card.improve.map((s, i) => <div key={i} className="text-ink-2">→ {s}</div>)}</div>
        </div>
        {card.notes.map((n, i) => <div key={i} className="mt-2 text-[11px] text-ink-4">· {n}</div>)}
        <button onClick={close} className="mt-4 w-full rounded-lg bg-accent py-2 text-[13px] font-semibold text-black">Done</button>
      </div>
    </div>
  );
}

export default function Workbench({ id, mode, close }: { id: string; mode: "practice" | "mock"; close: () => void }) {
  const { notify } = useLaunch();
  const [p, setP] = useState<ProblemView | null>(null);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [lastFull, setLastFull] = useState<RunResult | null>(null);
  const [running, setRunning] = useState<"run" | "submit" | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [showTarget, setShowTarget] = useState(false);
  const [chatOpen, setChatOpen] = useState(mode === "mock");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [card, setCard] = useState<Scorecard | null>(null);
  const [ending, setEnding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const started = useRef(Date.now());
  const editor = useRef<EditorHandle>(null);
  const chat = useRef<InterviewerHandle>(null);
  const mock = mode === "mock";

  useEffect(() => {
    api.codeOpen(id).then((v) => {
      setP(v);
      setHints(v.hints);
      // A mock is a fresh attempt: start from the starter, not yesterday's draft.
      setCode(mock ? v.starter : v.code);
    }).catch((e) => setErr(String(e)));
  }, [id, mock]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // Autosave the draft (not during a mock, which shouldn't overwrite your practice draft).
  useEffect(() => {
    if (!p || mock) return;
    const t = setTimeout(() => { void api.codeSaveDraft(id, code); }, 700);
    return () => clearTimeout(t);
  }, [code, id, p, mock]);

  const elapsed = Math.floor((now - started.current) / 1000);
  const left = MOCK_SECS - elapsed;

  const exec = useCallback(async (full: boolean) => {
    if (running || !p) return;
    setRunning(full ? "submit" : "run");
    setErr(null);
    try {
      const r = await api.codeRun(id, code, full, Math.floor((Date.now() - started.current) / 1000), mock);
      setResult(r);
      if (full) setLastFull(r);
      if (r.progress) setP((x) => (x ? { ...x, progress: r.progress! } : x));
      if (r.solved) {
        const slow = r.complexity && (r.complexity.verdict === "slow" || r.complexity.verdict === "timeout");
        notify(slow ? "Correct — but slower than the target. It comes back tomorrow." : `Solved${r.progress?.due ? ` · next review ${r.progress.due}` : ""}`);
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setRunning(null);
    }
  }, [running, p, id, code, mock, notify]);

  // ?run=submit (with ?problem=) submits on open — used to screenshot judged runs.
  const autorun = useRef(new URLSearchParams(location.search).get("run"));
  useEffect(() => {
    if (p && autorun.current) { const full = autorun.current === "submit"; autorun.current = null; void exec(full); }
  }, [p, exec]);

  // ⌘↵ / ⌘⇧↵ work even when focus is outside the editor.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== "Enter") return;
      const inEditor = (e.target as HTMLElement)?.closest?.(".cm-editor");
      const inText = (e.target as HTMLElement)?.tagName === "TEXTAREA";
      if (inEditor || inText) return;
      e.preventDefault();
      void exec(e.shiftKey);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [exec]);

  const marks: Mark[] = useMemo(() => {
    if (!result) return [];
    const m: Mark[] = result.compileErrors.filter((e) => e.line > 0).map((e) => ({ line: e.line, kind: "error" }));
    for (const c of [...result.cases, ...(result.stressFail ? [result.stressFail] : [])]) if (!c.ok && c.line) m.push({ line: c.line, kind: "error" });
    for (const l of result.lint) if (l.severity === "warn") m.push({ line: l.line, kind: "warn" });
    return m;
  }, [result]);

  const ctx = useCallback(() => ({
    code, lastRun: result, elapsedSecs: Math.floor((Date.now() - started.current) / 1000),
    hintsUsed: hints.length, mode: mock ? "mock" as const : "tutor" as const,
  }), [code, result, hints.length, mock]);

  const nextHint = async () => {
    if (!p) return;
    try { const h = await api.codeHint(id, hints.length + 1); setHints((x) => [...x, h]); } catch (e) { setErr(String(e)); }
  };
  const doReveal = async () => {
    const solved = result?.solved || p?.progress.status === "solved";
    if (!solved && !confirm("See the reference solution? That's fine for learning — the problem comes back tomorrow either way.")) return;
    try { setReveal(await api.codeReveal(id)); } catch (e) { setErr(String(e)); }
  };
  const endMock = async () => {
    setEnding(true);
    try { setCard(await api.codeMockFinish(id, messages, lastFull ?? result, elapsed)); }
    catch (e) { setErr(String(e)); }
    finally { setEnding(false); }
  };

  if (!p) return <div className="flex h-full items-center justify-center text-[12px] text-ink-3">{err ?? "Opening…"}</div>;
  const solvedNow = result?.solved || p.progress.status === "solved";

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* header */}
      <div className="flex shrink-0 items-center gap-3">
        <button onClick={() => { if (!mock || card || confirm("Leave the interview without a scorecard?")) close(); }} className="rounded-full border border-line-2 px-3 py-1 text-[12px] text-ink-2 hover:text-ink">← Code</button>
        <span className="h-2 w-2 rounded-full" style={{ background: DIFF_COLOR[p.difficulty] }} />
        <span className="text-[15px] font-semibold">{p.title}</span>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">{p.difficulty} · {p.pattern}</span>
        <button onClick={() => setShowTarget((v) => !v)} className="font-mono text-[11px] text-ink-3 hover:text-ink">
          {showTarget ? `target ${bigO(p.target.time)} time · ${p.target.space ? `O(${p.target.space}) space` : ""}` : "show target complexity"}
        </button>
        <div className="flex-1" />
        {mock
          ? <span className={`num font-mono text-[15px] ${left < 300 ? "text-warning" : "text-ink"}`}>{left > 0 ? clock(left) : `+${clock(left)} over`}</span>
          : <span className="num font-mono text-[13px] text-ink-3">{clock(elapsed)}</span>}
        <button onClick={() => exec(false)} disabled={!!running} className="rounded-md border border-line-2 px-3 py-1.5 text-[12px] hover:border-accent/60 disabled:opacity-50">Run <span className="text-ink-4">⌘↵</span></button>
        <button onClick={() => exec(true)} disabled={!!running} className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-black disabled:opacity-50">Submit <span className="opacity-60">⌘⇧↵</span></button>
        {!mock && <button onClick={() => setChatOpen((v) => !v)} className={`rounded-md border px-3 py-1.5 text-[12px] ${chatOpen ? "border-accent/60 text-ink" : "border-line-2 text-ink-3"}`}>Coach</button>}
        {mock && <button onClick={endMock} disabled={ending} className="rounded-md border border-warning/60 px-3 py-1.5 text-[12px] text-warning disabled:opacity-50">{ending ? "Scoring…" : "End interview"}</button>}
      </div>
      <ErrorLine error={err} />

      <div className="flex min-h-0 flex-1 gap-3">
        {/* statement */}
        <section className="hud flex w-[340px] shrink-0 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5">
            <div className="prose-chat selectable text-[13px] leading-relaxed text-ink-2"><ReactMarkdown>{p.statement}</ReactMarkdown></div>
            {p.examples.map((e, i) => (
              <div key={i} className="selectable rounded-md border border-line bg-bg/50 p-2.5 font-mono text-[11.5px]">
                <div className="text-ink-4">Example {i + 1}</div>
                <div className="text-ink-2">{e.input}</div>
                <div><span className="text-ink-4">→ </span><span className="text-ink">{e.output}</span></div>
              </div>
            ))}
            {p.constraints.length > 0 && <div><div className="label mb-1">Constraints</div>{p.constraints.map((c, i) => <div key={i} className="font-mono text-[11.5px] text-ink-3">· {c}</div>)}</div>}

            {!mock && (
              <div>
                <div className="label mb-1.5">Hints {hints.length}/{p.hintCount}</div>
                {hints.map((h, i) => <div key={i} className="mb-1.5 rounded-md border border-accent/30 bg-accent/5 p-2.5 text-[12.5px] text-ink-2"><span className="font-mono text-[10.5px] text-accent">{i + 1} · </span>{h}</div>)}
                {hints.length < p.hintCount && (
                  <button onClick={nextHint} className="w-full rounded-md border border-dashed border-line-2 py-1.5 text-[12px] text-ink-3 hover:text-ink-2">
                    {hints.length === 0 ? "Stuck? First hint — a nudge, not the answer" : `Hint ${hints.length + 1} — ${hints.length === 1 ? "the key insight" : "nearly the algorithm"}`}
                  </button>
                )}
                {hints.length > 0 && <p className="mt-1 text-[10.5px] text-ink-4">Hints are fine — the problem just comes back sooner.</p>}
              </div>
            )}
            {mock && <p className="text-[11.5px] text-ink-4">In a mock, ask the interviewer when you're stuck. That's how it works in a real interview.</p>}

            {!mock && (
              <div className="space-y-1.5">
                {solvedNow && <div className="label">After solving</div>}
                <button onClick={doReveal} className="w-full rounded-md border border-line-2 py-1.5 text-[12px] text-ink-3 hover:text-ink-2">
                  {solvedNow ? "Compare with the reference solution" : "Give up — show the solution"}
                </button>
              </div>
            )}
            {reveal && (
              <div className="space-y-2">
                <div className="rounded-md border border-line p-2.5 text-[12.5px] text-ink-2">{reveal.explain}</div>
                <div className="h-[280px] overflow-hidden rounded-md border border-line bg-bg/60"><JavaEditor value={reveal.code} onChange={() => {}} readOnly /></div>
                <div className="label">Follow-ups an interviewer asks</div>
                {reveal.followups.map((f, i) => (
                  <button key={i} onClick={() => { setChatOpen(true); setTimeout(() => chat.current?.send(`Follow-up: ${f} — here's my thinking: `), 50); }}
                    className="block w-full rounded-md border border-line px-2.5 py-1.5 text-left text-[12px] text-ink-2 hover:border-accent/50">{f} <span className="text-ink-4">→ discuss</span></button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* editor + results */}
        <section className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="hud relative min-h-0 flex-[1.4] overflow-hidden">
            <JavaEditor ref={editor} value={code} onChange={setCode} onRun={() => exec(false)} onSubmit={() => exec(true)} marks={marks} />
            <button onClick={() => { if (confirm("Reset to the starter code?")) setCode(p.starter); }} className="absolute right-2 top-2 rounded px-2 py-0.5 font-mono text-[10px] text-ink-4 hover:text-ink-2">reset</button>
          </div>
          <div className="hud min-h-0 flex-1 overflow-hidden">
            <Results r={result} params={p.params} running={running} onJump={(l) => editor.current?.jumpTo(l)} hasBench={p.hasBench} />
          </div>
        </section>

        {/* interviewer */}
        {chatOpen && (
          <section className="hud w-[320px] shrink-0 overflow-hidden">
            <Interviewer ref={chat} problemId={id} mode={mock ? "mock" : "tutor"} ctx={ctx} messages={messages} setMessages={setMessages} autoOpen={mock} />
          </section>
        )}
      </div>
      {card && <ScorecardView card={card} close={() => { setCard(null); close(); }} />}
    </div>
  );
}
