// School as a world: the semester agent at the centre (teaching mode), a week
// clock around it, course planets you can enter, a focus arc, tools on the rim.

import { useEffect, useRef, useState } from "react";
import { api, DirScan } from "../api";
import AgentConsole from "../components/AgentConsole";
import { AgentState } from "../components/Avatar";
import DirOrbit from "../components/DirOrbit";
import { Center, Crumb, LauncherRing, Node, RingLabel, Track, World } from "../components/rings";
import { useData } from "../data";
import { useNow } from "../hooks";
import { arc, band, pt } from "../lib/polar";
import { duration, hhmm, isoDay, minutesOf, nowAndNext, sessions } from "../lib/time";
import { modeById } from "../modes";
import { clock, Courses, DAYS, Focus, loadFocus, SLOTS } from "./SchoolParts";

const ACCENT = modeById("school").accent;
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY0 = 7 * 60, DAY1 = 21 * 60; // each day's sector maps the waking hours 7a–9p
const SECTOR = 360 / 7;
const R = { week0: 156, week1: 196, weekLabel: 214, courses: 292, focus: 376 };

/** Week-clock angle for a day (1..7) and minute of day. */
const weekAngle = (day: number, minute: number) =>
  (day - 1) * SECTOR + (Math.min(Math.max(minute, DAY0), DAY1) - DAY0) / (DAY1 - DAY0) * SECTOR;

function WeekClock() {
  const now = useNow(30_000);
  const { schedule } = useData();
  const courses = schedule.data?.courses ?? [];
  const today = isoDay(now);
  const nowA = weekAngle(today, minutesOf(now));
  const [hx, hy] = pt(118, nowA), [tx, ty] = pt(R.week1 + 10, nowA);
  return (
    <g>
      {WEEK.map((d, i) => {
        const a0 = i * SECTOR, a1 = (i + 1) * SECTOR;
        const [lx, ly] = pt(R.weekLabel + 6, a0 + SECTOR / 2);
        return (
          <g key={d}>
            <path d={band(R.week0, R.week1, a0 + 0.6, a1 - 0.6)} fill={i + 1 === today ? ACCENT : "var(--color-surface-3)"} fillOpacity={i + 1 === today ? 0.16 : 0.5} />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" className={`font-mono ${i + 1 === today ? "fill-ink" : "fill-ink-4"}`} fontSize={11} letterSpacing="0.12em">{d.toUpperCase()}</text>
          </g>
        );
      })}
      {courses.flatMap((c, ci) => c.days.map((day) => {
        const color = SLOTS[ci % SLOTS.length];
        const done = day < today || (day === today && minutesOf(now) >= c.end);
        return (
          <path key={`${c.code}-${day}`} d={arc((R.week0 + R.week1) / 2, weekAngle(day, c.start), weekAngle(day, c.end))}
            fill="none" stroke={color} strokeWidth={R.week1 - R.week0 - 8} strokeOpacity={done ? 0.35 : 1} />
        );
      }))}
      <line x1={hx} y1={hy} x2={tx} y2={ty} stroke={ACCENT} strokeWidth={2} style={{ filter: `drop-shadow(0 0 6px ${ACCENT})` }} />
      <RingLabel id="lbl-week" r={R.week1 + 34} text="THIS WEEK · 7A–9P PER DAY" at={-150} />
    </g>
  );
}

function CoursePlanets({ enter }: { enter: (path: string, name: string) => void }) {
  const now = useNow(30_000);
  const { schedule } = useData();
  const courses = schedule.data?.courses ?? [];
  const upcoming = sessions(courses, now, 8);
  return (
    <g>
      <Track r={R.courses} />
      {courses.map((c, i) => {
        const [x, y] = pt(R.courses, (i / courses.length) * 360 + 18);
        const color = SLOTS[i % SLOTS.length];
        const next = upcoming.find((s) => s.course.code === c.code);
        const today = c.days.includes(isoDay(now));
        return (
          <Node key={c.code} x={x} y={y} r={22} color={color} fill={today ? 0.35 : 0.18} glow={today}
            label={c.code} sub={next ? `in ${duration(next.start.getTime() - now.getTime())}` : undefined}
            onClick={c.folder ? () => enter(c.folder!, c.code) : undefined}
            hover={{ title: `${c.code} · ${c.title}`, color, lines: [`${c.days.map((d) => DAYS[d - 1] ?? "").join(" ")} · ${hhmm(c.start)}–${hhmm(c.end)}`, c.room], hint: c.folder ? "click → enter the course folder, meet its tutor agent" : "no course folder found" }} />
        );
      })}
      <RingLabel id="lbl-courses" r={R.courses + 40} text={`COURSES · ${courses.length}`} at={-28} />
    </g>
  );
}

function FocusArc({ open }: { open: () => void }) {
  const now = useNow(1000);
  const st = loadFocus();
  const left = st.endsAt ? Math.max(0, st.endsAt - now.getTime()) : st.remaining;
  const running = st.endsAt !== null;
  const frac = 1 - left / st.length;
  const [lx, ly] = pt(R.focus, 180);
  return (
    <g className="cursor-pointer" onClick={open}>
      <Track r={R.focus} dashed />
      {frac > 0 && <path d={arc(R.focus, 0, Math.max(0.5, frac * 360))} fill="none" stroke={ACCENT} strokeWidth={4} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${ACCENT})` }} />}
      <rect x={lx - 62} y={ly - 13} width={124} height={26} rx={13} fill="#111113" stroke={running ? ACCENT : "var(--color-line-2)"} />
      <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" className="font-mono" fontSize={12} fill={running ? ACCENT : "var(--color-ink-2)"}>
        {running ? `FOCUS ${clock(left)}` : `FOCUS · ${Math.round(st.length / 60_000)} MIN`}
      </text>
    </g>
  );
}

export default function School() {
  const { schedule } = useData();
  const now = useNow(30_000);
  const [root, setRoot] = useState<DirScan | null>(null);
  const [course, setCourse] = useState<{ path: string; name: string } | null>(null);
  const [courseScan, setCourseScan] = useState<DirScan | null>(null);
  const [tab, setTab] = useState("agent");
  const [state, setState] = useState<AgentState>("idle");
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);
  const nonce = useRef(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.config().then(({ config }) => api.dirScan(config.school_root)).then(setRoot).catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    if (!course) { setCourseScan(null); return; }
    api.dirScan(course.path).then(setCourseScan).catch((e) => setError(String(e)));
  }, [course]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "Escape" && course && !(t && ["INPUT", "TEXTAREA"].includes(t.tagName))) setCourse(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [course]);

  const { current, next } = nowAndNext(schedule.data?.courses ?? [], now);
  const agent = (course ? courseScan?.agent : root?.agent) ?? null;
  const ask = (text: string) => { setPrefill({ text, nonce: ++nonce.current }); setTab("agent"); };

  const tabs = [
    { id: "agent", label: "Tutor", node: agent ? <AgentConsole key={agent.id} profile={agent} scope={agent.scope} prefill={prefill} onState={setState}
        suggestions={course ? ["Quiz me on what this course covered recently.", "Explain the hardest idea in here like I'm about to be tested on it.", "Review my latest work in this folder — point at problems, don't fix them."]
          : ["What's due or coming up across my courses?", "Make me a study plan for this week around my classes.", "Quiz me on probability — expected value and variance."]} />
        : <div className="text-xs text-ink-3">{error ?? "Loading the semester agent…"}</div> },
    { id: "focus", label: "Focus", node: <Focus /> },
    { id: "courses", label: "Courses", node: <Courses /> },
  ];

  const crumbs = (
    <>
      <Crumb onClick={course ? () => setCourse(null) : undefined} active={!course}>School</Crumb>
      {course && <><span className="text-ink-4">›</span><Crumb active>{course.name}</Crumb><span className="ml-1 font-mono text-[10.5px] text-ink-4">esc · back</span></>}
    </>
  );

  return (
    <World title="School" crumbs={crumbs} tabs={tabs} tab={tab} setTab={setTab}>
      {course && courseScan ? (
        <DirOrbit scan={courseScan} state={state} enter={(p) => setCourse({ path: p, name: p.split("/").pop() ?? "" })} askAbout={ask} />
      ) : (
        <>
          <LauncherRing mode="school" color={ACCENT} />
          <FocusArc open={() => setTab("focus")} />
          <CoursePlanets enter={(path, name) => setCourse({ path, name })} />
          <WeekClock />
          <Center agent={agent} state={state} title="Semester" sub="TUTOR AGENT · TEACHES, DOESN'T DO IT FOR YOU"
            line={current ? `IN ${current.course.code} NOW` : next ? `${next.course.code} IN ${duration(next.start.getTime() - now.getTime()).toUpperCase()}` : undefined}
            onClick={() => setTab("agent")} />
        </>
      )}
    </World>
  );
}
