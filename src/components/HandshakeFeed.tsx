import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useState } from "react";
import { api, Feed, Opportunity, ScanEvent } from "../api";
import { useData } from "../data";
import { timeAgo } from "../hooks";
import { useLaunch } from "./launch";
import { ErrorLine, Panel, StatusBadge } from "./ui";

export const APPS_CHANGED = "atlas:applications-changed";

// Ordinal: one hue, stronger as fit improves.
function ScoreChip({ score }: { score: number }) {
  const tier = score >= 80 ? { label: "apply", bg: "#e0a700", fg: "#000" } : score >= 50 ? { label: "look", bg: "#8a6a10", fg: "#fff" } : { label: "skip", bg: "#3a3a3f", fg: "#c4c3bb" };
  return (
    <div className="flex w-14 shrink-0 flex-col items-center rounded-md py-1" style={{ background: tier.bg, color: tier.fg }}>
      <span className="display text-[18px] font-semibold leading-none">{score}</span>
      <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.12em]">{tier.label}</span>
    </div>
  );
}

const ELIGIBLE = { yes: { s: "good", l: "eligible" }, no: { s: "critical", l: "not eligible" }, unknown: { s: "unknown", l: "eligibility ?" } } as const;

function Row({ o, act }: { o: Opportunity; act: (o: Opportunity, status: Opportunity["status"]) => void }) {
  const toPipeline = async () => {
    const apps = await api.applications();
    if (!apps.some((a) => a.link && a.link === o.link)) {
      await api.saveApplications([{ id: crypto.randomUUID(), company: o.employer, role: o.title, stage: "wishlist", link: o.link, note: o.reasons, updated: new Date().toISOString() }, ...apps]);
      window.dispatchEvent(new Event(APPS_CHANGED));
    }
    act(o, "added");
  };
  const e = ELIGIBLE[o.eligible] ?? ELIGIBLE.unknown;
  return (
    <div className={`flex items-start gap-3 py-3 ${o.status === "dismissed" ? "opacity-45" : ""}`}>
      <ScoreChip score={o.score} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13.5px] font-medium">{o.title}</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-4">{o.kind}</span>
          <StatusBadge status={e.s} label={e.l} />
          {o.status === "added" && <StatusBadge status="good" label="in pipeline" />}
          {o.status === "saved" && <StatusBadge status="warning" label="saved" />}
        </div>
        <div className="mt-0.5 truncate text-[12px] text-ink-2">
          {[o.employer, o.location, o.pay].filter(Boolean).join(" · ")}
          {o.deadline && <span className="text-warning"> · due {o.deadline}</span>}
        </div>
        {o.reasons && <div className="mt-1 line-clamp-2 text-[11.5px] text-ink-3">→ {o.reasons}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {o.status !== "added" && <button onClick={toPipeline} title="Add to pipeline" className="rounded-md border border-line-2 px-2 py-1 text-[11px] text-ink-2 hover:border-accent/60 hover:text-ink">+ Pipeline</button>}
        {o.link && <button onClick={() => openUrl(o.link)} title="Open in Handshake" className="rounded-md border border-line-2 px-2 py-1 text-[11px] text-ink-2 hover:text-ink">↗</button>}
        {o.status === "new" && <button onClick={() => act(o, "saved")} title="Save" className="rounded-md px-1.5 py-1 text-ink-3 hover:text-warning">☆</button>}
        {o.status !== "dismissed"
          ? <button onClick={() => act(o, "dismissed")} title="Dismiss" className="rounded-md px-1.5 py-1 text-ink-4 hover:text-critical">×</button>
          : <button onClick={() => act(o, "new")} title="Restore" className="rounded-md px-1.5 py-1 text-ink-4 hover:text-ink">↺</button>}
      </div>
    </div>
  );
}

export default function HandshakeFeed() {
  const { launchers } = useData();
  const { fire } = useLaunch();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [scan, setScan] = useState<ScanEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [view, setView] = useState<"top" | "all" | "dismissed">("top");

  const load = useCallback(() => { api.opportunities().then(setFeed).catch((e) => setWarning(String(e))); }, []);
  useEffect(load, [load]);
  useEffect(() => {
    const un = api.onInboxEvent((e) => { setScan(e); if (e.stage === "done") load(); });
    return () => { un.then((f) => f()); };
  }, [load]);

  const run = async () => {
    setBusy(true);
    setWarning(null);
    try {
      const r = await api.scanInbox();
      setWarning(r.warning);
    } catch (e) {
      setWarning(String(e));
    } finally {
      setBusy(false);
      setScan(null);
      load();
    }
  };

  const act = (o: Opportunity, status: Opportunity["status"]) =>
    api.setOpportunity(o.id, status).then(load).catch((e) => setWarning(String(e)));

  const items = feed?.items ?? [];
  const shown = items.filter((o) =>
    view === "dismissed" ? o.status === "dismissed" : view === "all" ? o.status !== "dismissed" : o.status !== "dismissed" && o.score >= 50);
  const mail = launchers.data?.find((l) => l.id === "apple-mail");
  const neverScanned = !feed?.lastScan;

  return (
    <Panel title="Handshake feed" className="h-full"
      meta={feed?.lastScan ? `scanned ${timeAgo(feed.lastScan)}${feed.lastSource ? ` via ${feed.lastSource}` : ""} · ${items.filter((o) => o.status !== "dismissed" && o.score >= 80).length} to apply to` : "local agent · read-only"}
      action={
        <button onClick={run} disabled={busy} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50">
          {busy ? "Scanning…" : "Scan inbox"}
        </button>
      }>
      {busy && scan && (
        <div className="mb-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[12px]">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-accent">{scan.stage}</span>
          {scan.total > 0 && <span className="num ml-2 font-mono text-[11px] text-ink-3">{scan.done}/{scan.total}</span>}
          <span className="ml-2 text-ink-2">{scan.detail}</span>
        </div>
      )}

      {neverScanned && !busy && (
        <div className="rounded-lg border border-dashed border-line-2 p-4">
          <div className="text-[13px] font-medium">Connect your school inbox — one time</div>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[12px] text-ink-2">
            <li>Open Mail and add the account Handshake emails (for most schools, Mail → Settings → Accounts → +, Microsoft Exchange). You sign in with Microsoft in Mail — Atlas never sees your password.
              {mail && <button onClick={() => fire(mail)} className="ml-2 rounded border border-line-2 px-1.5 py-0.5 text-[11px] text-ink hover:border-accent/60">Open Mail</button>}</li>
            <li>Press <span className="font-medium text-ink">Scan inbox</span>. macOS will ask to let Atlas control Mail — allow it.</li>
            <li>After the first scan, Atlas re-scans every 6 hours while it's open.</li>
          </ol>
          <p className="mt-3 text-[11px] text-ink-4">
            No Mail setup? Save Handshake emails as .eml into{" "}
            <button onClick={() => feed && revealItemInDir(feed.dropDir)} className="font-mono text-accent hover:underline">inbox-drop</button> and scan.
          </p>
        </div>
      )}

      {!neverScanned && (
        <>
          <div className="mb-1 flex gap-1">
            {([["top", "For you"], ["all", "All"], ["dismissed", "Dismissed"]] as const).map(([v, label]) => (
              <button key={v} onClick={() => setView(v)}
                className={`rounded-md px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] ${view === v ? "bg-surface-3 text-ink" : "text-ink-3 hover:text-ink-2"}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="divide-y divide-line">
            {shown.length === 0 && <div className="py-6 text-center text-xs text-ink-3">{view === "top" ? "Nothing scoring 50+ yet." : "Nothing here."}</div>}
            {shown.map((o) => <Row key={o.id} o={o} act={act} />)}
          </div>
        </>
      )}
      <ErrorLine error={warning} />
    </Panel>
  );
}

const SIX_HOURS = 6 * 3600_000;

/** Re-scans every 6h while Atlas runs, but only once the user has completed a Mail scan themselves. */
export function useInboxAutoScan(notify: (text: string) => void) {
  useEffect(() => {
    let busy = false;
    const tick = async () => {
      if (busy) return;
      try {
        const f = await api.opportunities();
        if (!f.lastScan || !f.lastSource.includes("Mail")) return;
        if (Date.now() - new Date(f.lastScan).getTime() < SIX_HOURS) return;
        busy = true;
        const before = new Set(f.items.map((o) => o.id));
        await api.scanInbox();
        const after = await api.opportunities();
        const strong = after.items.filter((o) => !before.has(o.id) && o.score >= 80);
        if (strong.length) notify(`Handshake: ${strong.length} strong match${strong.length > 1 ? "es" : ""} — ${strong[0].employer}`);
      } catch { /* a failed background scan just waits for the next tick */ } finally {
        busy = false;
      }
    };
    const first = setTimeout(tick, 60_000);
    const id = setInterval(tick, 30 * 60_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [notify]);
}
