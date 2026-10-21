// One folder as its own concentric world, with its agent at the centre.
//
//   centre   the folder's agent
//   r 165    what it's made of: languages as a segmented ring
//   r 268    sub-folders as planets — click to go one level deeper
//   r 360    the files in this folder, one dot each — click to ask about one
//   r 432    the last 30 days: commits as blips, today at the top, clockwise into the past

import { useState } from "react";
import { DirScan } from "../api";
import { timeAgo } from "../hooks";
import { arc, C, pt } from "../lib/polar";
import { AvatarG, AgentState } from "./Avatar";
import { useHover } from "./rings";

const LANG = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9"];
const R = { core: 118, lang: 165, dirs: 268, files: 360, time: 432 };

export interface Hover { title: string; lines: string[]; color?: string; hint?: string }

function RingLabel({ id, r, text }: { id: string; r: number; text: string }) {
  return (
    <>
      <defs><path id={id} d={arc(r, -60, -5)} /></defs>
      <text className="fill-ink-4 font-mono" fontSize={11} letterSpacing="0.2em">
        <textPath href={`#${id}`} startOffset="100%" textAnchor="end">{text}</textPath>
      </text>
    </>
  );
}

export default function DirOrbit({ scan, state, enter, askAbout, setHover: setHoverProp, children }: {
  scan: DirScan; state: AgentState; enter: (path: string) => void;
  askAbout: (text: string) => void; setHover?: (h: Hover | null) => void; children?: React.ReactNode;
}) {
  // Inside a World the shared hover readout is used; the root Orbit passes its own.
  const ctxHover = useHover();
  const setHover = setHoverProp ?? ctxHover;
  const [hot, setHot] = useState<string | null>(null);
  const accent = scan.agent.accent;
  const hov = (id: string, h: Hover | null) => { setHot(h ? id : null); setHover(h); };

  // languages
  const langTotal = scan.languages.reduce((n, [, c]) => n + c, 0) || 1;
  let acc = 0;
  const langs = scan.languages.map(([ext, n], i) => {
    const a0 = (acc / langTotal) * 360, a1 = ((acc + n) / langTotal) * 360;
    acc += n;
    return { ext, n, a0, a1, color: LANG[i % LANG.length] };
  });

  // sub-folders: most active first, at most 18 on the ring
  const dirs = [...scan.children].sort((a, b) => b.commits30d - a.commits30d || b.files - a.files).slice(0, 18);
  const maxFiles = Math.max(1, ...dirs.map((d) => d.files));

  // files: up to 72 dots
  const files = scan.files.slice(0, 72);

  // time ring
  const now = Date.now();
  const blips = scan.commits.map((c) => ({ ...c, days: (now - new Date(c.at).getTime()) / 86_400_000 })).filter((c) => c.days >= 0 && c.days <= 30);

  return (
    <svg viewBox="0 0 1000 1000" className="h-full w-full overflow-visible select-none">
      {children}
      {/* time ring */}
      <circle cx={C} cy={C} r={R.time} fill="none" stroke="var(--color-line)" />
      {Array.from({ length: 30 }, (_, d) => {
        const [x0, y0] = pt(R.time - (d % 7 === 0 ? 9 : 4), (d / 30) * 360), [x1, y1] = pt(R.time + (d % 7 === 0 ? 9 : 4), (d / 30) * 360);
        return <line key={d} x1={x0} y1={y0} x2={x1} y2={y1} stroke={d === 0 ? "var(--accent)" : "var(--color-line-2)"} strokeWidth={d === 0 ? 2 : 1} />;
      })}
      {blips.map((c, i) => {
        const [x, y] = pt(R.time, (c.days / 30) * 360);
        const id = `c${i}`;
        return (
          <circle key={id} cx={x} cy={y} r={Math.min(9, 3.5 + Math.sqrt(c.files))} fill={accent} fillOpacity={hot === id ? 1 : 0.75} stroke="var(--color-bg)" strokeWidth={1.5} className="cursor-pointer"
            onMouseEnter={() => hov(id, { title: c.subject, color: accent, lines: [`${timeAgo(c.at)} · ${c.files} file${c.files === 1 ? "" : "s"} changed here`] })}
            onMouseLeave={() => hov(id, null)} />
        );
      })}
      <RingLabel id="lbl-time" r={R.time + 22} text={`LAST 30 DAYS · ${blips.length} COMMITS${scan.dirty ? ` · ${scan.dirty} UNCOMMITTED` : ""}`} />

      {/* files */}
      <circle cx={C} cy={C} r={R.files} fill="none" stroke="var(--color-line)" strokeDasharray="1 6" />
      {files.map((f, i) => {
        const [x, y] = pt(R.files, ((i + 0.5) / Math.max(1, files.length)) * 360);
        const id = `f${i}`;
        const doc = /^(readme|agents|claude)\.md$/i.test(f.name);
        const changed = f.commits30d > 0;
        return (
          <g key={id} className="cursor-pointer" onClick={() => askAbout(`Explain ${f.name}: what it does and how it fits in this folder.`)}
            onMouseEnter={() => hov(id, { title: f.name, color: changed ? accent : undefined, lines: [`${(f.size / 1024).toFixed(1)} KB${f.modified ? ` · edited ${timeAgo(f.modified)}` : ""}`, changed ? `${f.commits30d} commit${f.commits30d > 1 ? "s" : ""} in 30 days` : "unchanged in 30 days"], hint: "click → ask the agent to explain it" })}
            onMouseLeave={() => hov(id, null)}>
            {doc
              ? <rect x={x - 6} y={y - 7} width={12} height={14} rx={2} fill="var(--color-ink)" fillOpacity={hot === id ? 1 : 0.85} />
              : <circle cx={x} cy={y} r={hot === id ? 7 : changed ? 5.5 : 4} fill={changed ? accent : "var(--color-ink-4)"} />}
          </g>
        );
      })}
      <RingLabel id="lbl-files" r={R.files + 20} text={`FILES · ${scan.files.length}`} />

      {/* sub-folders */}
      <circle cx={C} cy={C} r={R.dirs} fill="none" stroke="var(--color-line)" />
      {dirs.map((d, i) => {
        const a = (i / Math.max(1, dirs.length)) * 360 + (dirs.length % 2 ? 0 : 180 / dirs.length);
        const [x, y] = pt(R.dirs, a);
        const r = 10 + 18 * Math.sqrt(d.files / maxFiles);
        const active = d.commits30d > 0;
        const id = `d${i}`;
        return (
          <g key={d.path} className="cursor-pointer" onClick={() => enter(d.path)}
            onMouseEnter={() => hov(id, { title: `${d.name}/`, color: accent, lines: [`${d.files} files · ${d.dirs} folders`, active ? `touched by ${d.commits30d} commit${d.commits30d > 1 ? "s" : ""} in 30 days` : "quiet for 30 days"], hint: "click → enter, meet its agent" })}
            onMouseLeave={() => hov(id, null)}>
            <circle cx={x} cy={y} r={r + (hot === id ? 4 : 0)} fill={accent} fillOpacity={active ? 0.3 : 0.12} stroke={accent} strokeOpacity={active ? 1 : 0.5}
              style={active ? { filter: `drop-shadow(0 0 8px ${accent})` } : undefined} />
            {d.hasDocs && <circle cx={x + r * 0.7} cy={y - r * 0.7} r={3.5} fill="var(--color-ink)" />}
            <text x={x} y={y + r + 18} textAnchor="middle" className={active ? "fill-ink" : "fill-ink-3"} fontSize={13}>
              {d.name}{active && <tspan className="fill-ink-3 font-mono" fontSize={11}> · {d.commits30d}</tspan>}
            </text>
          </g>
        );
      })}
      {scan.children.length > dirs.length && (
        <text x={C} y={C - R.dirs - 26} textAnchor="middle" className="fill-ink-4 font-mono" fontSize={11}>+{scan.children.length - dirs.length} more folders</text>
      )}
      <RingLabel id="lbl-dirs" r={R.dirs + 22} text={`FOLDERS · ${scan.children.length}`} />

      {/* languages */}
      {langs.map((l) => (
        <path key={l.ext} d={arc(R.lang, l.a0 + 0.6, Math.max(l.a0 + 0.8, l.a1 - 0.6))} fill="none" stroke={l.color} strokeWidth={6} strokeOpacity={0.75}
          className="cursor-pointer"
          onMouseEnter={() => hov(`l-${l.ext}`, { title: `.${l.ext}`, color: l.color, lines: [`${l.n} files · ${Math.round((l.n / langTotal) * 100)}%`] })}
          onMouseLeave={() => hov(`l-${l.ext}`, null)} />
      ))}
      {langs.filter((l) => l.a1 - l.a0 > 26).map((l) => {
        const [x, y] = pt(R.lang + 22, (l.a0 + l.a1) / 2);
        return <text key={l.ext} x={x} y={y} textAnchor="middle" dominantBaseline="central" className="fill-ink-3 font-mono" fontSize={11}>.{l.ext}</text>;
      })}

      {/* centre: the agent */}
      <circle cx={C} cy={C} r={R.core} fill="#111113" stroke={accent} strokeOpacity={0.5} />
      <AvatarG seed={scan.agent.seed} accent={accent} size={150} cx={C} cy={C - 22} state={state} />
      <text x={C} y={C + 62} textAnchor="middle" className="fill-ink" fontSize={19} fontWeight={600}>{scan.agent.name}</text>
      <text x={C} y={C + 84} textAnchor="middle" className="fill-ink-3 font-mono" fontSize={10.5} letterSpacing="0.12em">
        {scan.agent.role === "project" ? "PROJECT AGENT" : "FOLDER AGENT"} · {scan.agent.model.toUpperCase()}
      </text>
    </svg>
  );
}
