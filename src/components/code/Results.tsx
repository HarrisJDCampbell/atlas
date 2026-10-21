// What the judge found: compile errors, each test, the stress counterexample, the
// measured complexity and Java red flags. Every claim here came from running Java.

import { useEffect, useState } from "react";
import { CaseResult, RunResult } from "../../api";
import SpeedChart from "./SpeedChart";
import { bigO as big } from "../../lib/bigo";


function Case({ c, params, onJump, title }: { c: CaseResult; params: string[]; onJump: (l: number) => void; title?: string }) {
  const [open, setOpen] = useState(!c.ok);
  return (
    <div className={`rounded-md border ${c.ok ? "border-line" : "border-critical/40 bg-critical/5"}`}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left">
        <span className={`font-mono text-[11px] ${c.ok ? "text-good" : "text-critical"}`}>{c.ok ? "✓" : "✗"}</span>
        <span className="text-[12px] text-ink-2">{title ?? `Case ${c.i + 1}`}</span>
        <span className="truncate font-mono text-[11px] text-ink-4">{c.input.join(", ")}</span>
        <span className="ml-auto shrink-0 font-mono text-[10.5px] text-ink-4">{c.ms < 1 ? "<1" : c.ms.toFixed(0)} ms</span>
      </button>
      {open && (
        <div className="selectable space-y-1 border-t border-line px-2.5 py-2 font-mono text-[11.5px]">
          {c.input.map((v, i) => <div key={i}><span className="text-ink-4">{params[i] ?? `arg${i}`} = </span><span className="text-ink-2">{v}</span></div>)}
          <div><span className="text-ink-4">expected </span><span className="text-ink">{c.want}</span></div>
          {c.error
            ? <div className="text-critical">
                {c.error}
                {c.line && <button onClick={() => onJump(c.line!)} className="ml-2 underline decoration-dotted">line {c.line}</button>}
              </div>
            : <div><span className="text-ink-4">got </span><span className={c.ok ? "text-good" : "text-critical"}>{c.got}</span></div>}
          {c.stdout && <pre className="mt-1 max-h-32 overflow-auto rounded bg-bg/70 p-2 text-[11px] text-ink-3">{c.stdout}</pre>}
        </div>
      )}
    </div>
  );
}

export function Verdict({ r }: { r: RunResult }) {
  if (r.broken) return <span className="text-critical">⚠ {r.broken}</span>;
  if (!r.compiled) return <span className="text-critical">✗ Doesn't compile</span>;
  const ok = r.cases.filter((c) => c.ok).length;
  if (!r.passed) {
    if (ok === r.cases.length && r.stressOk === false) return <span className="text-critical">✗ Stress test found a counterexample</span>;
    return <span className="text-critical">✗ {ok}/{r.cases.length} tests pass</span>;
  }
  if (!r.full) return <span className="text-good">✓ {ok}/{r.cases.length} tests pass <span className="text-ink-3">— submit for stress + speed</span></span>;
  const c = r.complexity;
  if (c && (c.verdict === "slow" || c.verdict === "timeout")) return <span className="text-warning">▲ Correct, but slower than {big(c.target)}</span>;
  return <span className="text-good">✓ Solved{c?.slope != null ? ` · measured n^${c.slope.toFixed(2)}` : ""}</span>;
}

export default function Results({ r, params, running, onJump, hasBench }: {
  r: RunResult | null; params: string[]; running: "run" | "submit" | null; onJump: (l: number) => void; hasBench: boolean;
}) {
  const [tab, setTab] = useState("tests");
  // Jump to whichever tab explains the outcome.
  useEffect(() => {
    if (!r) return;
    if (!r.compiled || r.cases.some((c) => !c.ok)) setTab("tests");
    else if (r.stressOk === false) setTab("stress");
    else if (r.full && r.complexity) setTab("speed");
    else setTab("tests");
  }, [r]);

  if (running) {
    return (
      <div className="flex h-full items-center justify-center gap-2 font-mono text-[12px] text-ink-3">
        <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
        {running === "submit" ? "compiling · tests · stress · timing at doubling n…" : "compiling · running the tests…"}
      </div>
    );
  }
  if (!r) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-[12px] text-ink-3">
        <div><span className="kbd">⌘↵</span> run the tests · <span className="kbd">⌘⇧↵</span> submit: tests, stress and speed</div>
        <div className="text-ink-4">Your code runs against a reference solution. Nothing here is a model's opinion.</div>
      </div>
    );
  }

  const warns = r.lint.filter((l) => l.severity === "warn").length;
  const tabs = [
    { id: "tests", label: r.compiled ? `Tests ${r.cases.filter((c) => c.ok).length}/${r.cases.length}` : "Compile" },
    { id: "stress", label: r.stressOk == null ? "Stress" : r.stressOk ? `Stress ✓ ${r.stressCount}` : "Stress ✗" },
    ...(hasBench ? [{ id: "speed", label: r.complexity ? `Speed ${r.complexity.slope != null ? `n^${r.complexity.slope.toFixed(1)}` : r.complexity.verdict}` : "Speed" }] : []),
    { id: "java", label: `Java ${r.lint.length ? (warns ? `▲${warns}` : r.lint.length) : "✓"}` },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-line px-2 pt-1.5">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`rounded-t-md px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.1em] ${tab === t.id ? "bg-surface-3 text-ink" : "text-ink-3 hover:text-ink-2"}`}>{t.label}</button>
        ))}
        <span className="ml-auto pr-1 text-[12px]"><Verdict r={r} /></span>
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5">
        {tab === "tests" && !r.compiled && r.compileErrors.map((e, i) => (
          <div key={i} className="rounded-md border border-critical/40 bg-critical/5 p-2.5 font-mono text-[11.5px]">
            <div className="text-critical">
              {e.line > 0 && <button onClick={() => onJump(e.line)} className="mr-2 underline decoration-dotted">line {e.line}</button>}
              {e.msg}
            </div>
            {e.context && <pre className="selectable mt-1 whitespace-pre-wrap text-ink-3">{e.context}</pre>}
          </div>
        ))}
        {tab === "tests" && r.broken && <div className="text-[12px] text-critical">{r.broken}</div>}
        {tab === "tests" && r.cases.map((c) => <Case key={c.i} c={c} params={params} onJump={onJump} />)}

        {tab === "stress" && (r.stressOk == null
          ? <p className="text-[12px] text-ink-3">{r.full ? "Stress runs once every fixed test passes." : "Submit (⌘⇧↵) to run hundreds of small random inputs against the reference, smallest first."}</p>
          : r.stressOk
            ? <p className="text-[12px] text-ink-2">✓ {r.stressCount} random inputs, sizes 0 to 30, all match the reference.</p>
            : r.stressFail && <>
                <p className="text-[12px] text-ink-2">After {r.stressCount} random inputs, this one breaks it. It's the smallest failing size, so trace it by hand:</p>
                <Case c={r.stressFail} params={params} onJump={onJump} title="Counterexample" />
              </>)}

        {tab === "speed" && (r.complexity
          ? <>
              <p className={`text-[12.5px] ${r.complexity.verdict === "slow" || r.complexity.verdict === "timeout" ? "text-warning" : "text-ink-2"}`}>
                {r.complexity.verdict === "slow" || r.complexity.verdict === "timeout" ? "▲ " : "✓ "}{r.complexity.detail}
              </p>
              <SpeedChart bench={r.bench} />
              <p className="text-[11px] text-ink-4">Measured by timing your code at doubling n and fitting the slope. It can't tell O(n) from O(n log n) apart, but it can't miss O(n²).</p>
            </>
          : <p className="text-[12px] text-ink-3">{r.full ? "Speed is measured once correctness passes." : "Submit (⌘⇧↵) to time your code against the reference."}</p>)}

        {tab === "java" && (r.lint.length === 0
          ? <p className="text-[12px] text-ink-2">✓ No Java red flags found.</p>
          : r.lint.map((l, i) => (
              <button key={i} onClick={() => onJump(l.line)} className={`block w-full rounded-md border p-2.5 text-left text-[12px] ${l.severity === "warn" ? "border-warning/40 bg-warning/5" : "border-line"}`}>
                <span className={`font-mono text-[11px] ${l.severity === "warn" ? "text-warning" : "text-ink-3"}`}>{l.severity === "warn" ? "▲" : "·"} line {l.line} · {l.rule}</span>
                <div className="mt-0.5 text-ink-2">{l.msg}</div>
              </button>
            )))}
      </div>
    </div>
  );
}
