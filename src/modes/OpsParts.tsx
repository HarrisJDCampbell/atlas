import { openUrl } from "@tauri-apps/plugin-opener";
import { Metric as RcMetric, SentryProject } from "../api";
import { dayLabel, Empty, ErrorLine, Metric, Panel, RefreshButton, Sparkline, Status, StatusBadge } from "../components/ui";
import { useData } from "../data";
import { timeAgo } from "../hooks";
import { useShell } from "../shell";

export function crashFreeStatus(rate: number | null): { status: Status; label: string } {
  if (rate === null) return { status: "unknown", label: "No session data" };
  const pct = rate * 100;
  if (pct >= 99.5) return { status: "good", label: "Healthy" };
  if (pct >= 99) return { status: "warning", label: "Watch" };
  if (pct >= 98) return { status: "serious", label: "Degraded" };
  return { status: "critical", label: "Critical" };
}

export function formatMetric(m: RcMetric | undefined, currency: string): string {
  if (!m) return "—";
  if (m.unit === "$" || m.unit.toUpperCase() === currency) {
    return m.value.toLocaleString(undefined, { style: "currency", currency, maximumFractionDigits: m.value >= 1000 ? 0 : 2 });
  }
  return m.value.toLocaleString();
}

const LEVEL: Record<string, Status> = { fatal: "critical", error: "serious", warning: "warning", info: "unknown" };
// RevenueCat overview metric ids, in the order a subscription business reads them.
const ORDER = ["mrr", "revenue", "active_subscriptions", "active_trials", "new_customers", "active_users", "num_tx_last_28_days"];

export function SentryPanel({ p }: { p: SentryProject }) {
  const s = crashFreeStatus(p.crashFreeRate);
  return (
    <Panel title={p.slug} meta={p.owner ?? undefined} action={<StatusBadge status={s.status} label={s.label} />}>
      {p.error ? <ErrorLine error={p.error} /> : (
        <>
          <div className="grid grid-cols-3">
            <Metric label="Crash-free · 14d" value={p.crashFreeRate === null ? "—" : `${(p.crashFreeRate * 100).toFixed(2)}%`} />
            <Metric label="Unresolved" value={p.unresolved} />
            <Metric label="Top events · 24h" value={p.topEvents24h.toLocaleString()} />
          </div>
          {p.crashFreeSeries.length > 1 && (
            <div className="mt-3 px-3">
              <Sparkline values={p.crashFreeSeries} color="var(--accent)" height={34}
                format={(v, i) => `${dayLabel(p.crashFreeSeries.length - 1 - i)} · ${(v * 100).toFixed(2)}%`} />
            </div>
          )}
          <div className="mt-3 divide-y divide-line">
            {p.issues.length === 0 && <div className="py-3 text-xs text-ink-3">No unresolved issues with events in the last 24h.</div>}
            {p.issues.map((i) => (
              <button key={i.shortId} onClick={() => openUrl(i.permalink)} className="flex w-full items-center gap-3 rounded-md px-1 py-2.5 text-left hover:bg-surface-2/60">
                <StatusBadge status={LEVEL[i.level] ?? "unknown"} label={i.level} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px]">{i.title}</div>
                  <div className="truncate font-mono text-[10.5px] text-ink-3">{i.shortId} · {i.culprit}</div>
                </div>
                <div className="num shrink-0 text-right text-[11px] text-ink-2">
                  {i.count.toLocaleString()} ev · {i.userCount} users
                  <div className="text-ink-3">{timeAgo(i.lastSeen)}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

export function ProductionPanel() {
  const { health } = useData();
  return (
    <Panel title="Production" action={<RefreshButton onClick={health.refresh} loading={health.loading} />}>
      <div className="space-y-2">
        {(health.data ?? []).map((c) => (
          <div key={c.name} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2/50 px-3 py-3">
            <div className="min-w-0">
              <div className="text-[13px]">{c.name}</div>
              <div className="truncate font-mono text-[10.5px] text-ink-3">{c.url.replace("https://", "")}</div>
            </div>
            <div className="text-right">
              <StatusBadge status={c.ok ? "good" : "critical"} label={c.ok ? "Up" : c.error ?? `HTTP ${c.status}`} />
              <div className="num mt-1 font-mono text-[10.5px] text-ink-3">{c.latencyMs} ms</div>
            </div>
          </div>
        ))}
        {health.data?.length === 0 && <Empty title="No health checks">Add one under health_checks in the config.</Empty>}
      </div>
    </Panel>
  );
}

export function RevenuePanel() {
  const { revenue } = useData();
  const { openSettings } = useShell();
  const rev = revenue.data;
  const metrics = [...(rev?.metrics ?? [])].sort((a, b) => {
    const ia = ORDER.indexOf(a.id), ib = ORDER.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return (
    <Panel title="Revenue · RevenueCat" meta={rev?.connected ? `updated ${timeAgo(rev.fetchedAt)}` : undefined}
      action={<RefreshButton onClick={revenue.refresh} loading={revenue.loading} />}>
      {rev && !rev.connected && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-dashed border-line-2 px-4 py-5">
          <div><div className="text-sm text-ink-2">Not connected</div><div className="mt-1 text-xs text-ink-3">{rev.reason}</div></div>
          <button onClick={openSettings} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white">Connect</button>
        </div>
      )}
      {rev?.connected && <div className="grid grid-cols-2">{metrics.map((m) => <Metric key={m.id} label={m.name} value={formatMetric(m, rev.currency)} sub={m.description} />)}</div>}
      <p className="mt-3 text-[11px] text-ink-4">Revenue is reported before Apple's commission; take-home is roughly 70–85% of it.</p>
      <ErrorLine error={revenue.error} />
    </Panel>
  );
}

export function SentryList() {
  const { sentry } = useData();
  const { openSettings } = useShell();
  return (
    <div className="space-y-3">
      {sentry.data && !sentry.data.connected && (
        <Panel title="Sentry">
          <div className="flex items-center justify-between gap-4">
            <div className="text-xs text-ink-3">{sentry.data.reason}</div>
            <button onClick={openSettings} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white">Connect</button>
          </div>
        </Panel>
      )}
      {sentry.data?.projects.map((p) => <SentryPanel key={p.slug} p={p} />)}
      <ErrorLine error={sentry.error} />
    </div>
  );
}
