import { ReactNode, useState } from "react";

export function Panel({ title, meta, action, children, className = "", pad = true }: {
  title?: ReactNode; meta?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean;
}) {
  return (
    <section className={`hud rise flex min-w-0 flex-col ${className}`}>
      {(title || action || meta) && (
        <header className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2">
          <h2 className="label flex min-w-0 items-center gap-2">
            <span className="h-2 w-[3px] shrink-0 rounded-full bg-accent" />
            <span className="truncate">{title}</span>
            {meta && <span className="normal-case tracking-normal text-ink-4">{meta}</span>}
          </h2>
          {action}
        </header>
      )}
      <div className={`min-h-0 flex-1 ${pad ? "px-4 pb-4" : ""}`}>{children}</div>
    </section>
  );
}

/** A metric cell: label, big value, and a status line. */
export function Metric({ label, value, sub, onClick, children }: {
  label: string; value: ReactNode; sub?: ReactNode; onClick?: () => void; children?: ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={!onClick}
      className="group flex min-w-0 flex-col rounded-lg border border-transparent p-3 text-left transition-colors hover:border-line-2 hover:bg-surface-2/60 disabled:hover:border-transparent disabled:hover:bg-transparent">
      <span className="label">{label}</span>
      <span className="display mt-1.5 truncate text-[26px] font-light leading-none tracking-tight text-ink">{value}</span>
      {sub && <span className="mt-1.5 truncate text-[11px] text-ink-3">{sub}</span>}
      {children && <div className="mt-2">{children}</div>}
    </button>
  );
}

/** Thin bar with a rounded data-end; the label stays in text ink, the fill carries identity. */
export function Progress({ done, total, color, height = 6 }: { done: number; total: number; color: string; height?: number }) {
  const pct = total > 0 ? (done / total) * 100 : 0;
  return (
    <div className="w-full overflow-hidden rounded-full bg-surface-3" style={{ height }}>
      <div className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${pct}%`, background: color, minWidth: done > 0 ? height : 0, boxShadow: `0 0 10px ${color}66` }} />
    </div>
  );
}

/** Bar sparkline with a per-bar hover readout. `labelFor(i)` names a bucket. */
export function Sparkbars({ values, color, labelFor, height = 32 }: {
  values: number[]; color: string; labelFor: (i: number, v: number) => string; height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...values);
  return (
    <div className="relative">
      <div className="flex items-end gap-[2px]" style={{ height }} onMouseLeave={() => setHover(null)}>
        {values.map((v, i) => (
          <div key={i} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
            <div className="w-full rounded-t-[2px]"
              style={{
                height: v === 0 ? 2 : `${Math.max(8, (v / max) * 100)}%`,
                background: v === 0 ? "var(--color-surface-3)" : color,
                opacity: hover === null || hover === i ? 1 : 0.45,
              }} />
          </div>
        ))}
      </div>
      {hover !== null && (
        <div className="num pointer-events-none absolute -top-7 z-10 whitespace-nowrap rounded-md border border-line-2 bg-surface-3 px-2 py-0.5 text-[11px] text-ink"
          style={{ left: `${(hover / values.length) * 100}%`, transform: `translateX(-${(hover / values.length) * 100}%)` }}>
          {labelFor(hover, values[hover])}
        </div>
      )}
    </div>
  );
}

/** Line sparkline with a crosshair readout; gaps (null) break the line. */
export function Sparkline({ values, color, format, height = 36 }: {
  values: (number | null)[]; color: string; format: (v: number, i: number) => string; height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return <div className="text-xs text-ink-3" style={{ height }}>Not enough data</div>;
  const min = Math.min(...nums), max = Math.max(...nums);
  const span = max - min || 1;
  const w = 100, h = 100;
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => h - ((v - min) / span) * (h - 12) - 6;
  let d = "", pen = false;
  values.forEach((v, i) => {
    if (v === null) { pen = false; return; }
    d += `${pen ? "L" : "M"}${x(i)},${y(v)} `;
    pen = true;
  });
  const hv = hover !== null ? values[hover] : null;
  return (
    <div className="relative" style={{ height }}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={h} stroke="var(--color-ink-3)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="absolute inset-0 flex" onMouseLeave={() => setHover(null)}>
        {values.map((_, i) => <div key={i} className="h-full flex-1" onMouseEnter={() => setHover(i)} />)}
      </div>
      {hover !== null && (
        <div className="num pointer-events-none absolute -top-7 z-10 whitespace-nowrap rounded-md border border-line-2 bg-surface-3 px-2 py-0.5 text-[11px]"
          style={{ left: `${x(hover)}%`, transform: `translateX(-${x(hover)}%)` }}>
          {hv === null ? "no data" : format(hv, hover)}
        </div>
      )}
    </div>
  );
}

export type Status = "good" | "warning" | "serious" | "critical" | "unknown";
export const STATUS: Record<Status, { color: string; icon: string }> = {
  good: { color: "var(--color-good)", icon: "●" },
  warning: { color: "var(--color-warning)", icon: "▲" },
  serious: { color: "var(--color-serious)", icon: "◆" },
  critical: { color: "var(--color-critical)", icon: "■" },
  unknown: { color: "var(--color-ink-4)", icon: "○" },
};

/** Status always ships as icon + label, never color alone. */
export function StatusBadge({ status, label }: { status: Status; label: string }) {
  const s = STATUS[status];
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line-2 bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-2">
      <span style={{ color: s.color }} aria-hidden>{s.icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-2 px-4 py-5 text-center">
      <div className="text-sm text-ink-2">{title}</div>
      {children && <div className="mt-1 text-xs text-ink-3">{children}</div>}
    </div>
  );
}

export function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="selectable mt-2 rounded-md bg-critical/10 px-3 py-2 text-xs text-ink-2">{error}</div>;
}

export function RefreshButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button onClick={onClick} className="text-xs text-ink-3 hover:text-ink" title="Refresh">
      <span className={loading ? "inline-block animate-spin" : ""}>↻</span>
    </button>
  );
}

export function dayLabel(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export const gb = (b: number) => (b / 1024 ** 3).toFixed(1);
