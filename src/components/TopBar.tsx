import { useData } from "../data";
import { useNow } from "../hooks";
import { ModeId, modeKey, MODES } from "../modes";
import { gb, STATUS, Status } from "./ui";
import { crashFreeStatus } from "../modes/OpsParts";
import { formatMetric } from "../modes/OpsParts";

export function Mark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="22" fill="none" stroke="var(--color-line-2)" strokeWidth="3" />
      <path d="M32 10 A22 22 0 0 1 54 32" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" />
      <path d="M21 48 L32 16 L43 48 M25 38 H39" fill="none" stroke="var(--color-ink)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Chip({ status, label, value, title, onClick }: { status: Status; label: string; value: string; title?: string; onClick?: () => void }) {
  const s = STATUS[status];
  return (
    <button onClick={onClick} title={title ?? label}
      className="flex items-center gap-1.5 rounded-md px-1.5 py-1 font-mono text-[10.5px] text-ink-3 hover:bg-surface-2 hover:text-ink-2">
      <span className={status === "good" ? "live-dot" : ""} style={{ color: s.color }} aria-hidden>{s.icon}</span>
      <span className="hidden uppercase tracking-[0.12em] min-[1400px]:inline">{label}</span>
      <span className="num text-ink-2">{value}</span>
    </button>
  );
}

export default function TopBar({ mode, setMode, openPalette, openSettings }: {
  mode: ModeId; setMode: (m: ModeId) => void; openPalette: () => void; openSettings: () => void;
}) {
  const { health, sentry, revenue, stats } = useData();
  const now = useNow(1000);

  const checks = health.data ?? [];
  const down = checks.filter((c) => !c.ok);
  const prod: Status = checks.length === 0 ? "unknown" : down.length ? "critical" : "good";
  const prodVal = checks.length === 0 ? "—" : down.length ? `${down.length} down` : `${Math.max(...checks.map((c) => c.latencyMs))}ms`;

  const sp = sentry.data?.connected ? sentry.data.projects : [];
  const rates = sp.map((p) => p.crashFreeRate).filter((r): r is number => r !== null);
  const sentryStatus = sentry.data?.connected ? crashFreeStatus(rates.length ? Math.min(...rates) : null).status : "unknown";
  const unresolved = sp.reduce((n, p) => n + p.unresolved, 0);

  const mrr = revenue.data?.connected ? formatMetric(revenue.data.metrics.find((m) => m.id === "mrr"), revenue.data.currency) : "—";

  const s = stats.data;
  const memPct = s ? s.memUsed / s.memTotal : 0;
  const memStatus: Status = !s ? "unknown" : memPct > 0.9 ? "critical" : memPct > 0.8 ? "warning" : "good";

  return (
    <header data-tauri-drag-region className="relative z-20 flex h-[52px] shrink-0 items-center gap-3 border-b border-line bg-bg/70 pl-[84px] pr-3 backdrop-blur-xl">
      <div data-tauri-drag-region className="flex items-center gap-2 pr-2">
        <Mark />
        <span data-tauri-drag-region className="font-mono text-[12px] font-bold tracking-[0.32em]">ATLAS</span>
      </div>

      <nav className="flex h-full shrink-0 items-stretch">
        {MODES.map((m, i) => {
          const active = m.id === mode;
          return (
            <button key={m.id} onClick={() => setMode(m.id)} title={`${m.blurb} · ⌘${modeKey(i)}`}
              className={`group relative flex items-center gap-1.5 px-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors ${active ? "text-ink" : "text-ink-3 hover:text-ink-2"}`}>
              <span className="h-1.5 w-1.5 rounded-full transition-opacity" style={{ background: m.accent, opacity: active ? 1 : 0.35 }} />
              {m.name}
              <span className={`hidden text-[9.5px] tracking-normal min-[1700px]:inline ${active ? "text-ink-3" : "text-ink-4 opacity-0 group-hover:opacity-100"}`}>⌘{modeKey(i)}</span>
              {active && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full" style={{ background: m.accent, boxShadow: `0 0 12px ${m.accent}` }} />}
            </button>
          );
        })}
      </nav>

      <div data-tauri-drag-region className="flex-1" />

      <div className="flex shrink-0 items-center">
        <Chip status={prod} label="Prod" value={prodVal} title={"Production\n" + checks.map((c) => `${c.name}: ${c.ok ? "ok" : c.error ?? c.status}`).join("\n")} onClick={() => setMode("ops")} />
        <Chip status={sentryStatus} label="Sentry" value={sentry.data?.connected ? String(unresolved) : "—"} onClick={() => setMode("ops")} />
        <Chip status={revenue.data?.connected ? "good" : "unknown"} label="MRR" value={mrr} onClick={() => setMode("ops")} />
        <Chip status={memStatus} label="Mem" value={s ? `${gb(s.memUsed)}/${gb(s.memTotal)}` : "—"} title="Memory in use — models, Chrome and everything else share it" onClick={() => setMode("ai")} />
      </div>

      <button onClick={openPalette} title="Search everything · ⌘K"
        className="flex h-8 shrink-0 items-center gap-2 rounded-lg border border-line-2 bg-surface-1/80 px-2.5 text-left text-[12px] text-ink-3 hover:border-accent/50 hover:text-ink-2 2xl:w-52">
        <span aria-hidden>⌕</span>
        <span className="hidden flex-1 whitespace-nowrap 2xl:inline">Search everything</span>
        <span className="kbd">⌘K</span>
      </button>

      <div className="num w-[66px] shrink-0 text-right font-mono text-[13px] text-ink-2">
        {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
      </div>
      <button onClick={openSettings} title="Settings · ⌘," className="rounded-md px-1.5 py-1 text-ink-3 hover:bg-surface-2 hover:text-ink">⚙</button>
    </header>
  );
}

export function Footer({ openKeys }: { openKeys: () => void }) {
  return (
    <footer className="relative z-20 flex h-7 shrink-0 items-center gap-5 border-t border-line bg-bg/70 px-4 font-mono text-[10px] text-ink-4 backdrop-blur-xl">
      <span><span className="kbd mr-1.5">⌘K</span>search</span>
      <span><span className="kbd mr-1.5">⌘1–0</span>modes</span>
      <span><span className="kbd mr-1.5">A–Z</span>launch in mode</span>
      <span><span className="kbd mr-1.5">⌃⌥␣</span>summon from anywhere</span>
      <button onClick={openKeys} className="hover:text-ink-2"><span className="kbd mr-1.5">?</span>all keys</button>
      <span className="flex-1" />
      <span>local · private</span>
    </footer>
  );
}
