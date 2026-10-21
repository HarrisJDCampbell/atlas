// Identities and their accounts: who a post speaks for, and how each account
// posts. Setup is a few clicks per account; the sign-ins themselves stay with
// n8n or Metricool, never in Atlas.

import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { Account, api, Identity } from "../api";
import { useData } from "../data";
import { useLaunch } from "./launch";
import { ErrorLine, Panel, StatusBadge } from "./ui";

export const PLATFORMS: Record<string, { name: string; routes: Account["route"][]; how: string }> = {
  x: { name: "X", routes: ["n8n", "manual"], how: "n8n holds the sign-in. Needs an X developer app (free tier has tight monthly limits — check current X pricing)." },
  linkedin: { name: "LinkedIn", routes: ["n8n", "manual"], how: "Posting via LinkedIn's official API through n8n is allowed. Messaging/connection automation is not — outreach stays copy-and-paste." },
  instagram: { name: "Instagram", routes: ["metricool", "manual"], how: "Through Metricool, which already passed Meta's review. Atlas copies the caption and opens your planner." },
  threads: { name: "Threads", routes: ["metricool", "manual"], how: "Through Metricool, or the Threads composer opens pre-filled." },
  tiktok: { name: "TikTok", routes: ["metricool", "manual"], how: "Through Metricool (TikTok's posting API requires an audited app)." },
  youtube: { name: "YouTube", routes: ["metricool", "manual"], how: "Through Metricool, or YouTube Studio." },
  bluesky: { name: "Bluesky", routes: ["manual"], how: "Copy and paste for now." },
};

const ROUTE_LABEL: Record<Account["route"], string> = { n8n: "via n8n", metricool: "via Metricool", manual: "manual" };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "id";

export function useIdentities() {
  const [list, setList] = useState<Identity[]>([]);
  const load = () => api.identities().then(setList).catch(() => {});
  useEffect(() => { load(); }, []);
  const save = async (next: Identity[]) => { setList(next); await api.saveIdentities(next); };
  return { list, save, load };
}

function AccountRow({ ident, a, update, remove }: { ident: Identity; a: Account; update: (a: Account) => void; remove: () => void }) {
  const { notify } = useLaunch();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const p = PLATFORMS[a.platform] ?? { name: a.platform, routes: ["manual"], how: "" };

  const connect = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.connectN8n(ident.id, a.id);
      update({ ...a, route: "n8n", n8nWorkflowId: r.workflowId });
      await openUrl(r.editorUrl);
      notify(`n8n opened — sign in to ${p.name} on the post node, then switch the workflow on`);
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };

  const ready = a.route === "manual" || (a.route === "n8n" && !!a.n8nWorkflowId) || (a.route === "metricool" && !!a.metricoolBrand);
  return (
    <div className="rounded-lg border border-line bg-surface-2/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[13px] font-medium">{p.name}</span>
          <input value={a.handle} onChange={(e) => update({ ...a, handle: e.target.value })} placeholder="@handle" spellCheck={false}
            className="selectable w-36 rounded border border-line-2 bg-bg/60 px-2 py-0.5 font-mono text-[11.5px] outline-none focus:border-accent/60" />
        </div>
        <div className="flex items-center gap-1.5">
          <StatusBadge status={ready ? (a.route === "manual" ? "unknown" : "good") : "warning"} label={ROUTE_LABEL[a.route]} />
          <button onClick={remove} title="Remove account" className="text-ink-4 hover:text-critical">×</button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {p.routes.map((r) => (
          <button key={r} onClick={() => r === "n8n" ? connect() : update({ ...a, route: r, metricoolBrand: r === "metricool" ? a.metricoolBrand : a.metricoolBrand })}
            disabled={busy}
            className={`rounded-md border px-2 py-0.5 text-[11px] ${a.route === r ? "border-accent/70 bg-accent/10 text-ink" : "border-line-2 text-ink-3 hover:text-ink-2"}`}>
            {r === "n8n" ? (a.n8nWorkflowId ? "Reconnect in n8n" : busy ? "Creating…" : "Connect via n8n") : r === "metricool" ? "Metricool" : "Manual"}
          </button>
        ))}
        {a.route === "n8n" && a.n8nWorkflowId && (
          <button onClick={() => openUrl(`http://localhost:5678/workflow/${a.n8nWorkflowId}`)} className="rounded-md border border-line-2 px-2 py-0.5 text-[11px] text-ink-3">Open workflow ↗</button>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-ink-4">{p.how}</p>
      <ErrorLine error={err} />
    </div>
  );
}

function IdentityCard({ ident, change, remove }: { ident: Identity; change: (i: Identity) => void; remove: () => void }) {
  const { projects } = useData();
  const [adding, setAdding] = useState("");
  const field = "selectable w-full rounded-lg border border-line-2 bg-surface-2 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent/60";
  const addAccount = (platform: string) => {
    const id = `${ident.id}-${platform}${ident.accounts.some((a) => a.platform === platform) ? `-${ident.accounts.length + 1}` : ""}`;
    const route = PLATFORMS[platform].routes.includes("metricool") ? "metricool" : "manual";
    change({ ...ident, accounts: [...ident.accounts, { id, platform, handle: "", route, n8nWorkflowId: "", metricoolBrand: "" }] });
    setAdding("");
  };
  return (
    <section className="hud rise space-y-2.5 p-3.5" style={{ ["--tick" as string]: `${ident.accent}aa` }}>
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: ident.accent, boxShadow: `0 0 8px ${ident.accent}` }} />
        <input value={ident.name} onChange={(e) => change({ ...ident, name: e.target.value })} className="selectable flex-1 bg-transparent text-[14px] font-semibold outline-none" />
        <select value={ident.kind} onChange={(e) => change({ ...ident, kind: e.target.value as Identity["kind"] })}
          className="rounded border border-line-2 bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] uppercase outline-none">
          <option value="personal">personal</option><option value="business">business</option>
        </select>
        {ident.id !== "personal" && <button onClick={remove} title="Remove identity" className="text-ink-4 hover:text-critical">×</button>}
      </div>
      <label className="block"><span className="label">Voice</span>
        <textarea value={ident.voice} rows={2} onChange={(e) => change({ ...ident, voice: e.target.value })} className={`${field} mt-1 resize-y`} /></label>
      <div>
        <span className="label">Speaks about</span>
        <div className="mt-1 flex flex-wrap gap-1">
          {(projects.data ?? []).map((p) => {
            const on = ident.projects.includes(p.id);
            return <button key={p.id} onClick={() => change({ ...ident, projects: on ? ident.projects.filter((x) => x !== p.id) : [...ident.projects, p.id] })}
              className={`rounded-full border px-2 py-0.5 text-[11px] ${on ? "border-accent/70 bg-accent/10 text-ink" : "border-line-2 text-ink-4"}`}>{p.name}</button>;
          })}
        </div>
      </div>
      <label className="block"><span className="label">Never says (comma-separated — checked on every draft)</span>
        <input value={ident.banned.join(", ")} onChange={(e) => change({ ...ident, banned: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} className={`${field} mt-1`} /></label>
      <div className="space-y-2">
        <span className="label">Accounts</span>
        {ident.accounts.map((a) => (
          <AccountRow key={a.id} ident={ident} a={a}
            update={(na) => change({ ...ident, accounts: ident.accounts.map((x) => (x.id === a.id ? na : x)) })}
            remove={() => change({ ...ident, accounts: ident.accounts.filter((x) => x.id !== a.id) })} />
        ))}
        <div className="flex gap-1.5">
          <select value={adding} onChange={(e) => e.target.value && addAccount(e.target.value)}
            className="flex-1 rounded-lg border border-dashed border-line-2 bg-transparent px-2 py-1.5 text-[12px] text-ink-3 outline-none">
            <option value="">+ Add an account…</option>
            {Object.entries(PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
          </select>
        </div>
      </div>
    </section>
  );
}

export default function Accounts() {
  const { list, save } = useIdentities();
  const [err, setErr] = useState<string | null>(null);
  const change = (i: Identity) => save(list.map((x) => (x.id === i.id ? i : x))).catch((e) => setErr(String(e)));
  const add = () => {
    const name = `Business ${list.filter((i) => i.kind === "business").length + 1}`;
    save([...list, { id: slug(name), name, kind: "business", voice: "", projects: [], banned: [], rules: [], accent: ["#199e70", "#c98500", "#d55181", "#9085e9"][list.length % 4], accounts: [] }]).catch((e) => setErr(String(e)));
  };
  return (
    <div className="space-y-3">
      <Panel title="Identities & accounts" meta="who a post speaks for, and where it goes">
        <p className="text-[12px] text-ink-3">Each identity drafts in its own voice from its own projects, and its “never says” list is enforced on every draft. Accounts post only after you approve — through n8n (X, LinkedIn), Metricool (Instagram, TikTok, YouTube, Threads), or copy-and-paste.</p>
        <button onClick={add} className="mt-2 rounded-lg border border-dashed border-line-2 px-3 py-1.5 text-[12px] text-ink-2 hover:border-accent/60">+ Add a business identity</button>
        <ErrorLine error={err} />
      </Panel>
      {list.map((i) => <IdentityCard key={i.id} ident={i} change={change} remove={() => save(list.filter((x) => x.id !== i.id))} />)}
    </div>
  );
}
