import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { api, Application, Stage } from "../api";
import { APPS_CHANGED } from "../components/HandshakeFeed";
import { ErrorLine, Panel } from "../components/ui";
import { timeAgo } from "../hooks";

export const STAGES: { id: Stage; name: string }[] = [
  { id: "wishlist", name: "Wishlist" },
  { id: "applied", name: "Applied" },
  { id: "oa", name: "OA" },
  { id: "interview", name: "Interview" },
  { id: "offer", name: "Offer" },
  { id: "rejected", name: "Closed" },
];
// Ordinal: one hue, getting stronger as an application advances. Closed is neutral.
export const STAGE_COLOR: Record<Stage, string> = {
  wishlist: "#5c4a1e", applied: "#8a6a10", oa: "#b38606", interview: "#e0a700", offer: "#ffcf3d", rejected: "#3a3a3f",
};

export function Pipeline() {
  const [apps, setApps] = useState<Application[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ company: "", role: "", link: "" });

  useEffect(() => {
    const load = () => api.applications().then(setApps).catch((e) => setError(String(e)));
    load();
    window.addEventListener(APPS_CHANGED, load);
    return () => window.removeEventListener(APPS_CHANGED, load);
  }, []);
  const save = (next: Application[]) => {
    setApps(next);
    api.saveApplications(next).catch((e) => setError(String(e)));
  };
  const add = () => {
    if (!draft.company.trim()) return;
    save([{ id: crypto.randomUUID(), company: draft.company.trim(), role: draft.role.trim() || "SWE Intern", link: draft.link.trim(), stage: "wishlist", note: "", updated: new Date().toISOString() }, ...apps]);
    setDraft({ company: "", role: "", link: "" });
  };
  const move = (id: string, stage: Stage) => save(apps.map((a) => (a.id === id ? { ...a, stage, updated: new Date().toISOString() } : a)));
  const remove = (id: string) => save(apps.filter((a) => a.id !== id));

  const counts = STAGES.map((s) => ({ ...s, n: apps.filter((a) => a.stage === s.id).length }));
  const active = apps.filter((a) => a.stage !== "rejected" && a.stage !== "wishlist").length;
  const sorted = [...apps].sort((a, b) => STAGES.findIndex((s) => s.id === b.stage) - STAGES.findIndex((s) => s.id === a.stage) || b.updated.localeCompare(a.updated));

  return (
    <Panel title="Internship pipeline" meta={`${apps.length} tracked · ${active} in flight`}>
      <div className="grid grid-cols-6 gap-2">
        {counts.map((s) => (
          <div key={s.id} className="rounded-lg border border-line bg-surface-2/50 px-3 py-2.5">
            <div className="label">{s.name}</div>
            <div className="display mt-1 text-[26px] font-light leading-none">{s.n}</div>
            <div className="mt-2 h-1 rounded-full" style={{ background: STAGE_COLOR[s.id], opacity: s.n ? 1 : 0.3 }} />
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <input value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Company" className="selectable w-40 rounded-lg border border-line-2 bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-accent/60" />
        <input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Role (SWE Intern)" className="selectable w-44 rounded-lg border border-line-2 bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-accent/60" />
        <input value={draft.link} onChange={(e) => setDraft({ ...draft, link: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Posting URL" className="selectable flex-1 rounded-lg border border-line-2 bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-accent/60" />
        <button onClick={add} disabled={!draft.company.trim()} className="rounded-lg bg-accent px-4 text-xs font-semibold text-black disabled:opacity-40">Add</button>
      </div>

      <div className="mt-3 divide-y divide-line">
        {sorted.length === 0 && <div className="py-6 text-center text-xs text-ink-3">Nothing tracked yet. Add the first company you want to apply to.</div>}
        {sorted.map((a) => (
          <div key={a.id} className={`grid grid-cols-[1fr_150px_120px_70px_24px] items-center gap-3 py-2 ${a.stage === "rejected" ? "opacity-50" : ""}`}>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium">{a.company}</div>
              <div className="truncate text-[11px] text-ink-3">{a.role}</div>
            </div>
            <select value={a.stage} onChange={(e) => move(a.id, e.target.value as Stage)}
              className="rounded-md border border-line-2 bg-surface-2 px-2 py-1 font-mono text-[11px] uppercase text-ink-2 outline-none">
              {STAGES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {a.link ? <button onClick={() => openUrl(a.link)} className="truncate text-left text-[11px] text-accent hover:underline">↗ posting</button> : <span />}
            <span className="text-right font-mono text-[10px] text-ink-4">{timeAgo(a.updated)}</span>
            <button onClick={() => remove(a.id)} title="Remove" className="text-ink-4 hover:text-critical">×</button>
          </div>
        ))}
      </div>
      <ErrorLine error={error} />
      <p className="mt-3 text-[11px] text-ink-4">Stored in ~/.config/atlas/applications.json — plain JSON you own.</p>
    </Panel>
  );
}

export const DRILLS = [
  { title: "Mock system design: my main project", text: "Run a 30-minute system design interview on my most substantial project below: how its pieces fit together, where it fails, how it scales. Start with the first question." },
  { title: "Defend a trade-off", text: "Pick one real architectural decision from my projects and make me defend it like an interviewer would. One question at a time." },
  { title: "Behavioral: 'Tell me about a project'", text: "Coach my 2-minute 'tell me about a project you built' answer about my strongest project. Ask for my draft first, then grade it." },
  { title: "Complexity from my code", text: "Ask me a data-structures or complexity question grounded in something in my projects' code. Grade my answer." },
];

