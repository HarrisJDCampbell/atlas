import { Course } from "../api";

/** ISO weekday 1..7 (Mon..Sun) */
export const isoDay = (d: Date) => ((d.getDay() + 6) % 7) + 1;
export const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;

export const hhmm = (mins: number) => {
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")}${h < 12 ? "a" : "p"}`;
};

export function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

export interface Session { course: Course; start: Date; end: Date }

/** Every class meeting from `from` through the next `days` days, in order. */
export function sessions(courses: Course[], from: Date, days = 8): Session[] {
  const out: Session[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(from);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + i);
    for (const c of courses) {
      if (!c.days.includes(isoDay(day))) continue;
      const start = new Date(day.getTime() + c.start * 60_000);
      const end = new Date(day.getTime() + c.end * 60_000);
      if (end > from) out.push({ course: c, start, end });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function nowAndNext(courses: Course[], now: Date) {
  const s = sessions(courses, now);
  const current = s.find((x) => x.start <= now && x.end > now) ?? null;
  const next = s.find((x) => x.start > now) ?? null;
  return { current, next };
}

export function semesterWeek(firstDay: string, now: Date): number | null {
  if (!firstDay) return null;
  const start = new Date(`${firstDay}T00:00:00`);
  const w = Math.floor((now.getTime() - start.getTime()) / (7 * 86_400_000)) + 1;
  return w >= 1 && w <= 20 ? w : null;
}
