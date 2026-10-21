// Ops as a world: the production engineer at the centre, production health as a
// ring of service segments, Sentry projects as planets, revenue as nodes,
// ops tools on the rim. Anything not connected is drawn as a ghost you can click.

import { useEffect, useState } from "react";
import { AgentCfg, api } from "../api";
import AgentConsole from "../components/AgentConsole";
import { AgentState } from "../components/Avatar";
import { Center, cfgProfile, LauncherRing, Node, RingLabel, Track, World } from "../components/rings";
import { STATUS } from "../components/ui";
import { useData } from "../data";
import { arc, pt } from "../lib/polar";
import { modeById } from "../modes";
import { useShell } from "../shell";
import { crashFreeStatus, formatMetric, ProductionPanel, RevenuePanel, SentryList } from "./OpsParts";

const ACCENT = modeById("ops").accent;
const R = { health: 162, sentry: 282, revenue: 370 };
const REVENUE_IDS = ["mrr", "revenue", "active_subscriptions", "active_trials", "new_customers", "active_users"];
const REVENUE_NAMES: Record<string, string> = { mrr: "MRR", revenue: "Revenue 28d", active_subscriptions: "Subscribers", active_trials: "Trials", new_customers: "New 28d", active_users: "Active users" };

export default function Ops() {
  const { health, sentry, revenue, projects } = useData();
  const { openSettings } = useShell();
  const [agentCfg, setAgentCfg] = useState<AgentCfg | null>(null);
  const [tab, setTab] = useState("agent");
  const [state, setState] = useState<AgentState>("idle");
  useEffect(() => {
    api.config().then(({ config }) => setAgentCfg(config.agents.find((a) => a.id === "ops") ?? config.agents.find((a) => a.id.endsWith("-eng")) ?? config.agents[0] ?? null)).catch(() => {});
  }, []);
  const profile = agentCfg ? cfgProfile(agentCfg, ACCENT) : null;
  // The product in production: the first project with Sentry wired up, else the ops agent's first project.
  const product = (projects.data ?? []).find((p) => p.sentryProjects.length > 0)
    ?? (projects.data ?? []).find((p) => p.id === agentCfg?.context_projects[0]);
  const productName = product?.name ?? "Production";

  const checks = health.data ?? [];
  const down = checks.filter((c) => !c.ok);
  const sp = sentry.data?.connected ? sentry.data.projects : [];
  const slugs = sentry.data?.connected ? sp.map((p) => p.slug)
    : (projects.data ?? []).flatMap((p) => p.sentryProjects);
  const maxUnresolved = Math.max(1, ...sp.map((p) => p.unresolved));
  const rev = revenue.data;

  const tabs = [
    { id: "agent", label: "Engineer", node: profile && agentCfg ? <AgentConsole key={profile.id} profile={profile} agentId={agentCfg.id} onState={setState}
        suggestions={["Walk me through how a RevenueCat webhook flows through the backend.", "What would break first if Railway went down for an hour?", "What's the riskiest part of the subscription code?"]} /> : <div className="text-xs text-ink-3">Loading…</div> },
    { id: "health", label: "Health", node: <ProductionPanel /> },
    { id: "sentry", label: "Sentry", node: <SentryList /> },
    { id: "revenue", label: "Revenue", node: <RevenuePanel /> },
  ];

  return (
    <World title="Ops" crumbs={<span className="label">{productName} · production</span>} tabs={tabs} tab={tab} setTab={setTab}>
      <LauncherRing mode="ops" color={ACCENT} />

      {/* revenue */}
      <Track r={R.revenue} dashed />
      {REVENUE_IDS.map((id, i) => {
        const [x, y] = pt(R.revenue, (i / REVENUE_IDS.length) * 360); // offset from the Sentry planets at 90/210/330°
        const m = rev?.metrics.find((x) => x.id === id);
        const val = rev?.connected ? formatMetric(m, rev.currency) : "—";
        return (
          <Node key={id} x={x} y={y} r={14} color={rev?.connected ? "var(--color-good)" : "var(--color-ink-4)"} fill={rev?.connected ? 0.25 : 0.08}
            label={REVENUE_NAMES[id]} sub={val} onClick={rev?.connected ? () => setTab("revenue") : openSettings}
            hover={{ title: REVENUE_NAMES[id], lines: [rev?.connected ? `${val}${m?.description ? ` · ${m.description}` : ""}` : "RevenueCat isn't connected"], hint: rev?.connected ? "click → revenue" : "click → connect in Settings" }} />
        );
      })}
      <RingLabel id="lbl-rev" r={R.revenue + 44} text={rev?.connected ? "REVENUE · REVENUECAT" : "REVENUE · NOT CONNECTED — CLICK TO CONNECT"} at={-30} />

      {/* sentry */}
      <Track r={R.sentry} />
      {slugs.map((slug, i) => {
        const [x, y] = pt(R.sentry, (i / Math.max(1, slugs.length)) * 360 + 90);
        const p = sp.find((s) => s.slug === slug);
        const st = p ? crashFreeStatus(p.crashFreeRate) : { status: "unknown" as const, label: "not connected" };
        const col = p ? STATUS[st.status].color : "var(--color-ink-4)";
        const r = p ? 14 + 16 * Math.sqrt(p.unresolved / maxUnresolved) : 16;
        const ring = 2 * Math.PI * (r + 6);
        return (
          <Node key={slug} x={x} y={y} r={r} color={col} fill={p ? 0.3 : 0.08} glow={!!p && st.status !== "good"}
            label={slug} sub={p ? `${p.unresolved}` : undefined} onClick={p ? () => setTab("sentry") : openSettings}
            hover={{ title: slug, color: col, lines: p ? [`${p.unresolved} unresolved · ${p.topEvents24h} events in top issues (24h)`, p.crashFreeRate === null ? "no session data" : `crash-free ${(p.crashFreeRate * 100).toFixed(2)}% · ${st.label}`] : ["Sentry isn't connected"], hint: p ? "click → issues" : "click → connect in Settings" }}>
            {p?.crashFreeRate != null && <circle cx={x} cy={y} r={r + 6} fill="none" stroke={col} strokeWidth={2.5} strokeDasharray={`${ring * p.crashFreeRate} ${ring}`} transform={`rotate(-90 ${x} ${y})`} />}
          </Node>
        );
      })}
      <RingLabel id="lbl-sentry" r={R.sentry + 44} text={sentry.data?.connected ? "SENTRY · SIZE = UNRESOLVED · RING = CRASH-FREE" : "SENTRY · NOT CONNECTED"} at={150} />

      {/* health */}
      {checks.map((c, i) => {
        const span = 360 / Math.max(1, checks.length);
        const a0 = i * span + 2, a1 = (i + 1) * span - 2;
        const col = c.ok ? STATUS.good.color : STATUS.critical.color;
        const [lx, ly] = pt(R.health + 26, (a0 + a1) / 2);
        return (
          <g key={c.name} className="cursor-pointer" onClick={() => setTab("health")}>
            <path d={arc(R.health, a0, a1)} fill="none" stroke={col} strokeWidth={9} strokeOpacity={0.85} strokeLinecap="round" />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" className="fill-ink-2 font-mono" fontSize={11}>{c.name} · {c.ok ? `${c.latencyMs}ms` : "DOWN"}</text>
          </g>
        );
      })}
      {checks.length === 0 && <Track r={R.health} dashed />}

      <Center agent={profile} state={state} title={productName} sub={`OPS · ${(agentCfg?.name ?? "engineer").toUpperCase()}`}
        line={checks.length ? (down.length ? `${down.length} SERVICE${down.length > 1 ? "S" : ""} DOWN` : `PROD UP · ${Math.max(...checks.map((c) => c.latencyMs))}MS`) : undefined}
        onClick={() => setTab("agent")} />
    </World>
  );
}
