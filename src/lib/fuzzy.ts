/** Subsequence match with bonuses for word starts and contiguous runs. Higher is better; null = no match. */
export function fuzzy(query: string, text: string): number | null {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const t = text.toLowerCase();
  let score = 0, ti = 0, run = 0;
  for (const ch of q) {
    if (ch === " ") continue;
    const found = t.indexOf(ch, ti);
    if (found < 0) return null;
    const wordStart = found === 0 || /[\s\-_/·.]/.test(t[found - 1]);
    run = found === ti ? run + 1 : 0;
    score += 1 + (wordStart ? 3 : 0) + run * 2 - Math.min(found - ti, 6) * 0.2;
    ti = found + 1;
  }
  return score + (t.startsWith(q) ? 5 : 0);
}
