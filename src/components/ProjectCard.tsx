import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { api, Project } from "../api";
import { useData } from "../data";
import { timeAgo } from "../hooks";
import { dayLabel, Empty, ErrorLine, Progress, Sparkbars } from "./ui";

export function ProjectCard({ p, detailed = false }: { p: Project; detailed?: boolean }) {
  const { projects } = useData();
  const [err, setErr] = useState<string | null>(null);
  const r = p.roadmap;
  const pct = r && r.total > 0 ? Math.round((r.done / r.total) * 100) : null;

  const createRoadmap = async () => {
    try {
      const file = await api.createRoadmap(p.id);
      projects.refresh();
      await revealItemInDir(file);
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <div className="hud rise flex flex-col p-4" style={{ ["--tick" as string]: `${p.accent}88` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.accent, boxShadow: `0 0 10px ${p.accent}` }} />
            <h3 className="truncate text-[15px] font-semibold">{p.name}</h3>
          </div>
          <p className="mt-1 truncate text-xs text-ink-3">{p.tagline}</p>
        </div>
        <div className="shrink-0 whitespace-nowrap text-right">
          <div className="display text-[26px] font-light leading-none">{pct === null ? "—" : `${pct}%`}</div>
          <div className="num mt-1 font-mono text-[10px] text-ink-3">{r ? `${r.done}/${r.total} TASKS` : "NO ROADMAP"}</div>
        </div>
      </div>

      {!p.exists ? (
        <div className="mt-4"><Empty title={p.note ? "Waiting for folder access" : "Folder not found"}>{p.note ?? p.path}</Empty></div>
      ) : (
        <>
          <div className="mt-4">
            {r && r.total > 0 ? (
              <Progress done={r.done} total={r.total} color={p.accent} height={6} />
            ) : (
              <button onClick={createRoadmap}
                className="w-full rounded-lg border border-dashed border-line-2 py-2 text-xs text-ink-3 hover:border-ink-3 hover:text-ink-2">
                No checklist yet — create ROADMAP.md
              </button>
            )}
          </div>

          {detailed && r && r.sections.length > 0 && (
            <div className="mt-4 space-y-2.5">
              {r.sections.map((s) => (
                <div key={s.title}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                    <span className="truncate text-ink-2">{s.title}</span>
                    <span className="num shrink-0 font-mono text-[10.5px] text-ink-3">{s.done}/{s.total}</span>
                  </div>
                  <Progress done={s.done} total={s.total} color={p.accent} height={3} />
                  {s.next && <div className="mt-1 truncate text-[11px] text-ink-3">→ {s.next}</div>}
                </div>
              ))}
              <div className="font-mono text-[10px] text-ink-4">{r.file}</div>
            </div>
          )}

          {p.git && (
            <div className="mt-4">
              <div className="mb-2 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-ink-4">
                <span>Commits · 30d</span>
                <span className="num">{p.git.commits7d} this week</span>
              </div>
              <Sparkbars values={p.git.dailyCommits} color={p.accent} height={28}
                labelFor={(i, v) => `${dayLabel(29 - i)} · ${v} commit${v === 1 ? "" : "s"}`} />
              <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-ink-3">
                <span className="truncate font-mono">⎇ {p.git.branch}{p.git.dirtyFiles > 0 && <span className="text-warning"> · {p.git.dirtyFiles} uncommitted</span>}</span>
                <span className="shrink-0">{timeAgo(p.git.lastCommitAt)}</span>
              </div>
            </div>
          )}
          {!p.git && <div className="mt-4 text-[11px] text-ink-3">Not a git repository</div>}
        </>
      )}
      <ErrorLine error={err} />
    </div>
  );
}
