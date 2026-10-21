// Polar geometry on a 1000×1000 canvas centred at (500, 500).
// Angles are degrees, 0 at the top, increasing clockwise.
export const C = 500;
export const rad = (d: number) => (d * Math.PI) / 180;
export const pt = (r: number, a: number) => [C + r * Math.sin(rad(a)), C - r * Math.cos(rad(a))] as const;
const f = (n: number) => n.toFixed(2);

/** Arc along radius r; `reverse` draws it the other way so text on it reads upright. */
export function arc(r: number, a0: number, a1: number, reverse = false) {
  const [x0, y0] = pt(r, reverse ? a1 : a0), [x1, y1] = pt(r, reverse ? a0 : a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M${f(x0)},${f(y0)} A${r},${r} 0 ${large} ${reverse ? 0 : 1} ${f(x1)},${f(y1)}`;
}

/** Annular sector between r0 and r1. */
export function band(r0: number, r1: number, a0: number, a1: number) {
  const [ax, ay] = pt(r1, a0), [bx, by] = pt(r1, a1), [cx, cy] = pt(r0, a1), [dx, dy] = pt(r0, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${f(ax)},${f(ay)} A${r1},${r1} 0 ${large} 1 ${f(bx)},${f(by)} L${f(cx)},${f(cy)} A${r0},${r0} 0 ${large} 0 ${f(dx)},${f(dy)} Z`;
}

export const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
