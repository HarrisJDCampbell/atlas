// Your time vs the reference's as n doubles, on log-log axes, where a straight line's
// steepness is the exponent: slope 1 is O(n), slope 2 is O(n²).

import { useLayoutEffect, useRef, useState } from "react";
import { BenchPt } from "../../api";

const H = 210, L = 58, R = 84, T = 14, B = 34;
const fmtN = (n: number) => (n >= 1 << 20 ? `${n / (1 << 20)}M` : n >= 1024 ? `${n / 1024}K` : String(n));
export const fmtNs = (ns: number) =>
  ns >= 1e9 ? `${(ns / 1e9).toFixed(2)} s` : ns >= 1e6 ? `${(ns / 1e6).toFixed(1)} ms` : `${Math.round(ns / 1e3)} µs`;

export default function SpeedChart({ bench }: { bench: BenchPt[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  // Drawn at the real pixel width, so text stays 10px however wide the panel is.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(600);
  useLayoutEffect(() => {
    if (!box.current) return;
    setW(Math.max(320, box.current.clientWidth));
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  if (bench.length === 0) return null;

  const xs = bench.map((b) => Math.log2(b.n));
  const vals = bench.flatMap((b) => [b.ns, b.refNs]).filter((v) => v > 0);
  const x0 = Math.min(...xs), x1 = Math.max(...xs, x0 + 1);
  const y0 = Math.floor(Math.log10(Math.min(...vals))), y1 = Math.ceil(Math.log10(Math.max(...vals)) + 0.0001);
  const sx = (n: number) => L + ((Math.log2(n) - x0) / (x1 - x0)) * (W - L - R);
  const sy = (ns: number) => T + (1 - (Math.log10(ns) - y0) / Math.max(1, y1 - y0)) * (H - T - B);
  const line = (key: "ns" | "refNs") => bench.filter((b) => b[key] > 0).map((b, i) => `${i ? "L" : "M"}${sx(b.n).toFixed(1)},${sy(b[key]).toFixed(1)}`).join("");
  const mine = bench.filter((b) => b.ns > 0), refs = bench.filter((b) => b.refNs > 0);
  const timedOut = bench.find((b) => b.ns < 0);
  const lastMine = mine[mine.length - 1], lastRef = refs[refs.length - 1];
  const h = hover !== null ? bench[hover] : null;

  return (
    <div ref={box}>
      <div className="mb-1.5 flex items-center gap-4 text-[11px] text-ink-3">
        <span className="flex items-center gap-1.5"><span className="h-[2px] w-4 rounded bg-accent" />yours</span>
        <span className="flex items-center gap-1.5"><span className="h-[2px] w-4 rounded" style={{ background: "var(--color-ink-3)" }} />reference</span>
        <span className="ml-auto font-mono text-[10.5px] text-ink-4">log–log · steeper = worse Big-O</span>
        <button onClick={() => setTable((v) => !v)} className="font-mono text-[10.5px] text-ink-3 hover:text-ink">{table ? "chart" : "table"}</button>
      </div>
      {table ? (
        <table className="w-full font-mono text-[11.5px]">
          <thead><tr className="text-left text-ink-4"><th className="py-1 font-normal">n</th><th className="font-normal">yours</th><th className="font-normal">reference</th><th className="font-normal">ratio</th></tr></thead>
          <tbody>
            {bench.map((b) => (
              <tr key={b.n} className="border-t border-line text-ink-2">
                <td className="py-1">{b.n.toLocaleString()}</td>
                <td>{b.ns > 0 ? fmtNs(b.ns) : "timed out"}</td>
                <td>{b.refNs > 0 ? fmtNs(b.refNs) : "—"}</td>
                <td>{b.ns > 0 && b.refNs > 0 ? `${(b.ns / b.refNs).toFixed(1)}×` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible" onMouseLeave={() => setHover(null)}>
          {Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i).map((e) => (
            <g key={e}>
              <line x1={L} x2={W - R} y1={sy(10 ** e)} y2={sy(10 ** e)} stroke="var(--color-line)" />
              <text x={L - 8} y={sy(10 ** e)} textAnchor="end" dominantBaseline="central" className="fill-ink-4 font-mono" fontSize={10}>{fmtNs(10 ** e)}</text>
            </g>
          ))}
          {bench.map((b, i) => (i % 2 === 0 || bench.length < 7) && (
            <text key={b.n} x={sx(b.n)} y={H - B + 16} textAnchor="middle" className="fill-ink-4 font-mono" fontSize={10}>{fmtN(b.n)}</text>
          ))}
          <text x={(L + W - R) / 2} y={H - 2} textAnchor="middle" className="fill-ink-4 font-mono" fontSize={10}>n</text>
          {h && <line x1={sx(h.n)} x2={sx(h.n)} y1={T} y2={H - B} stroke="var(--color-line-2)" />}
          <path d={line("refNs")} fill="none" stroke="var(--color-ink-3)" strokeWidth={2} strokeLinejoin="round" />
          <path d={line("ns")} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
          {refs.map((b) => <circle key={`r${b.n}`} cx={sx(b.n)} cy={sy(b.refNs)} r={4} fill="var(--color-ink-3)" stroke="var(--color-surface-1)" strokeWidth={2} />)}
          {mine.map((b) => <circle key={`m${b.n}`} cx={sx(b.n)} cy={sy(b.ns)} r={4} fill="var(--accent)" stroke="var(--color-surface-1)" strokeWidth={2} />)}
          {timedOut && (
            <g>
              <text x={sx(timedOut.n)} y={T + 6} textAnchor="middle" className="fill-ink-2 font-mono" fontSize={13} fontWeight={700}>×</text>
              <text x={sx(timedOut.n)} y={T + 20} textAnchor="middle" className="fill-ink-3 font-mono" fontSize={9.5}>timed out</text>
            </g>
          )}
          {lastMine && <text x={sx(lastMine.n) + 8} y={sy(lastMine.ns)} dominantBaseline="central" className="fill-ink-2 font-mono" fontSize={10.5}>yours {fmtNs(lastMine.ns)}</text>}
          {lastRef && <text x={sx(lastRef.n) + 8} y={sy(lastRef.refNs) + (lastMine && Math.abs(sy(lastMine.ns) - sy(lastRef.refNs)) < 14 ? 14 : 0)} dominantBaseline="central" className="fill-ink-3 font-mono" fontSize={10.5}>ref {fmtNs(lastRef.refNs)}</text>}
          {bench.map((b, i) => (
            <rect key={`hit${b.n}`} x={sx(b.n) - 14} y={T} width={28} height={H - T - B} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
      )}
      <div className="mt-1 h-4 font-mono text-[11px] text-ink-2">
        {h && !table && <>n = {h.n.toLocaleString()} · yours {h.ns > 0 ? fmtNs(h.ns) : "timed out"} · reference {h.refNs > 0 ? fmtNs(h.refNs) : "—"}{h.ns > 0 && h.refNs > 0 && ` · ${(h.ns / h.refNs).toFixed(1)}×`}</>}
      </div>
    </div>
  );
}
