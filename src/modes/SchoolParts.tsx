import { useEffect, useState } from "react";
import { api, Course } from "../api";
import { useLaunch } from "../components/launch";
import { Panel } from "../components/ui";
import { useData } from "../data";
import { useNow } from "../hooks";
import { duration, hhmm, sessions } from "../lib/time";

// Courses take categorical slots in fixed order, so a course keeps its color everywhere.
export const SLOTS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9", "#e66767", "#008300"];
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export function useCourseColor() {
  const { schedule } = useData();
  const codes = (schedule.data?.courses ?? []).map((c) => c.code);
  return (c: Course) => SLOTS[Math.max(0, codes.indexOf(c.code)) % SLOTS.length];
}

export const FOCUS_KEY = "atlas.focus";
export const clock = (ms: number) => {
  const t = Math.ceil(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
export interface FocusState { endsAt: number | null; remaining: number; length: number }

export function loadFocus(): FocusState {
  try {
    return { endsAt: null, remaining: 50 * 60_000, length: 50 * 60_000, ...JSON.parse(localStorage.getItem(FOCUS_KEY) ?? "{}") };
  } catch {
    return { endsAt: null, remaining: 50 * 60_000, length: 50 * 60_000 };
  }
}

function chime() {
  try {
    const ctx = new AudioContext();
    [660, 880, 990].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.6);
    });
  } catch { /* no audio: the visual state still flips */ }
}

/** Focus block. The end time is stored, not a countdown, so it survives hide/quit. */
export function Focus() {
  const now = useNow(250);
  const { notify } = useLaunch();
  const [st, setSt] = useState<FocusState>(loadFocus);
  useEffect(() => { try { localStorage.setItem(FOCUS_KEY, JSON.stringify(st)); } catch { /* ignore */ } }, [st]);

  const left = st.endsAt ? Math.max(0, st.endsAt - now.getTime()) : st.remaining;
  useEffect(() => {
    if (st.endsAt && left === 0) {
      setSt((s) => ({ ...s, endsAt: null, remaining: s.length }));
      chime();
      notify("Focus block done. Take five.");
    }
  }, [left, st.endsAt, notify]);

  const running = st.endsAt !== null;
  const frac = 1 - left / st.length;
  const R = 70, C = 2 * Math.PI * R;
  const set = (min: number) => setSt({ endsAt: null, remaining: min * 60_000, length: min * 60_000 });

  return (
    <Panel title="Focus" meta={running ? "in progress" : "ready"}>
      <div className="flex items-center gap-6">
        <div className="relative h-[172px] w-[172px] shrink-0">
          <svg viewBox="0 0 172 172" className="h-full w-full -rotate-90">
            <circle cx="86" cy="86" r={R} fill="none" stroke="var(--color-surface-3)" strokeWidth="6" />
            <circle cx="86" cy="86" r={R} fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - frac)} style={{ filter: "drop-shadow(0 0 6px var(--accent))", transition: "stroke-dashoffset 250ms linear" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="display text-[40px] font-extralight tracking-tight">{clock(left)}</span>
            <span className="label mt-1">{Math.round(st.length / 60_000)} min block</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <button onClick={() => setSt((s) => running ? { ...s, endsAt: null, remaining: left } : { ...s, endsAt: Date.now() + s.remaining })}
            className="rounded-lg bg-accent px-3 py-2 text-[13px] font-medium text-black">
            {running ? "Pause" : left < st.length ? "Resume" : "Start focus"}
          </button>
          <button onClick={() => set(Math.round(st.length / 60_000))} className="rounded-lg border border-line-2 px-3 py-1.5 text-xs text-ink-2 hover:text-ink">Reset</button>
          <div className="mt-1 flex gap-1.5">
            {[25, 50, 90].map((m) => (
              <button key={m} onClick={() => set(m)} disabled={running}
                className={`flex-1 rounded-md border px-2 py-1 font-mono text-[11px] ${st.length === m * 60_000 ? "border-accent/60 text-ink" : "border-line text-ink-3"} disabled:opacity-40`}>{m}m</button>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function Courses() {
  const now = useNow(30_000);
  const { schedule, launchers } = useData();
  const { fire } = useLaunch();
  const color = useCourseColor();
  const courses = schedule.data?.courses ?? [];
  const upcoming = sessions(courses, now, 8);
  const ilearn = launchers.data?.find((l) => l.id === "ilearn");
  return (
    <Panel title="Courses" meta={`${courses.length} this semester`}>
      <div className="grid grid-cols-1 gap-3">
        {courses.map((c) => {
          const next = upcoming.find((s) => s.course.code === c.code);
          return (
            <div key={c.code} className="hud p-3.5" style={{ ["--tick" as string]: `${color(c)}aa` }}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-mono text-[12px] font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: color(c), boxShadow: `0 0 8px ${color(c)}` }} />{c.code}</span>
                <span className="font-mono text-[10px] text-ink-3">{c.days.map((d) => DAYS[d - 1] ?? "").join(" ")}</span>
              </div>
              <div className="mt-1.5 line-clamp-2 min-h-[36px] text-[13px] text-ink">{c.title}</div>
              <div className="num mt-1 font-mono text-[10.5px] text-ink-3">{hhmm(c.start)}–{hhmm(c.end)} · {c.room}</div>
              <div className="mt-2 text-[11px] text-ink-2">{next ? `Next in ${duration(next.start.getTime() - now.getTime())}` : "—"}</div>
              <div className="mt-3 flex gap-1.5">
                {c.folder && <button onClick={() => api.openCourseFolder(c.code)} className="flex-1 rounded-md border border-line-2 px-2 py-1 text-[11px] text-ink-2 hover:border-accent/60 hover:text-ink">▱ Folder</button>}
                {ilearn && <button onClick={() => fire(ilearn)} className="flex-1 rounded-md border border-line-2 px-2 py-1 text-[11px] text-ink-2 hover:border-accent/60 hover:text-ink">↗ iLearn</button>}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

