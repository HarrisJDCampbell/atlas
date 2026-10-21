import { Panel } from "../components/ui";
import { useData } from "../data";
import { timeAgo } from "../hooks";

export function Activity() {
  const { projects } = useData();
  const feed = (projects.data ?? [])
    .flatMap((p) => (p.git?.recent ?? []).map((c) => ({ ...c, p })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 30);
  return (
    <Panel title="Commit stream" meta="all repos · 30 days" className="h-full">
      <div className="relative ml-1.5 border-l border-line pl-4">
        {feed.length === 0 && <div className="py-4 text-xs text-ink-3">No commits in the last 30 days.</div>}
        {feed.map((c, i) => (
          <div key={`${c.p.id}-${c.at}-${i}`} className="relative py-2">
            <span className="absolute -left-[21px] top-[13px] h-2 w-2 rounded-full ring-4 ring-bg" style={{ background: c.p.accent }} />
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.1em]" style={{ color: c.p.accent }}>{c.p.name}</span>
              <span className="shrink-0 font-mono text-[10px] text-ink-4">{timeAgo(c.at)}</span>
            </div>
            <div className="selectable mt-0.5 line-clamp-2 text-[12.5px] text-ink-2">{c.subject}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

