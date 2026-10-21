// The top nav. Each mode is a "look": its own accent, layout and toolset.
export type ModeId = "command" | "school" | "build" | "ops" | "career" | "create" | "ai" | "missions" | "flows" | "code";

export interface Mode { id: ModeId; name: string; accent: string; blurb: string }

// Accents are the dark-surface categorical slots, so the seven read as distinct.
export const MODES: Mode[] = [
  { id: "command", name: "Orbit", accent: "#3987e5", blurb: "Everything around now" },
  { id: "school", name: "School", accent: "#199e70", blurb: "Classes, deadlines, focus" },
  { id: "build", name: "Build", accent: "#9085e9", blurb: "Repos, roadmaps, commits" },
  { id: "ops", name: "Ops", accent: "#d95926", blurb: "Your product in production" },
  { id: "career", name: "Career", accent: "#c98500", blurb: "Internship pipeline" },
  { id: "create", name: "Content", accent: "#d55181", blurb: "Posts and content, drafted from what you ship" },
  { id: "ai", name: "AI", accent: "#22a35a", blurb: "Local agents" },
  { id: "missions", name: "Missions", accent: "#e66767", blurb: "Agent swarms that research and build" },
  { id: "flows", name: "Flows", accent: "#ea4b71", blurb: "n8n workflows that act for you, behind your approval" },
  { id: "code", name: "Code", accent: "#21b3c4", blurb: "Java interview practice, judged by running Java" },
];

/** ⌘1–9 for the first nine modes, ⌘0 for the tenth. */
export const modeKey = (i: number) => (i === 9 ? "0" : String(i + 1));

export const modeById = (id: ModeId) => MODES.find((m) => m.id === id)!;
