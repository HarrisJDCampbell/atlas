import { createContext, ReactNode, useContext } from "react";
import { api, Health, Launcher, Project, RevenueOverview, Schedule, SentryOverview, Stats } from "./api";
import { Polled, usePoll } from "./hooks";

// Polled once at the app root so switching modes never refetches or flashes empty.
interface Data {
  projects: Polled<Project[]>;
  sentry: Polled<SentryOverview>;
  revenue: Polled<RevenueOverview>;
  health: Polled<Health[]>;
  stats: Polled<Stats>;
  schedule: Polled<Schedule>;
  launchers: Polled<Launcher[]>;
}

const Ctx = createContext<Data | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const value: Data = {
    projects: usePoll(api.projects, 30_000),
    sentry: usePoll(api.sentry, 120_000),
    revenue: usePoll(api.revenue, 300_000),
    health: usePoll(api.health, 60_000),
    stats: usePoll(api.stats, 3_000),
    schedule: usePoll(api.schedule, 600_000),
    launchers: usePoll(() => api.config().then((c) => c.config.launchers), 30_000),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): Data {
  const v = useContext(Ctx);
  if (!v) throw new Error("useData outside DataProvider");
  return v;
}
