// Typed wrappers over the Rust commands. Every external call (Sentry, RevenueCat,
// Ollama, git) happens in Rust; the webview never sees an API key.
import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface Section { title: string; done: number; total: number; next: string | null }
export interface Roadmap { file: string; done: number; total: number; sections: Section[] }
export interface GitInfo {
  branch: string;
  lastCommitAt: string | null;
  lastCommitSubject: string | null;
  commits7d: number;
  dirtyFiles: number;
  dailyCommits: number[];
  recent: { at: string; subject: string }[];
}
export interface Project {
  id: string;
  name: string;
  path: string;
  tagline: string;
  accent: string;
  exists: boolean;
  note: string | null;
  sentryProjects: string[];
  git: GitInfo | null;
  roadmap: Roadmap | null;
}

export interface Issue {
  shortId: string; title: string; culprit: string; level: string;
  count: number; userCount: number; lastSeen: string; permalink: string;
}
export interface SentryProject {
  slug: string; owner: string | null; unresolved: number; topEvents24h: number;
  crashFreeRate: number | null; crashFreeSeries: (number | null)[]; issues: Issue[]; error: string | null;
}
export interface SentryOverview { connected: boolean; reason: string | null; org: string; projects: SentryProject[] }

export interface Metric { id: string; name: string; description: string; value: number; unit: string; period: string }
export interface RevenueOverview { connected: boolean; reason: string | null; currency: string; metrics: Metric[]; fetchedAt: string }

export interface Health { name: string; url: string; ok: boolean; status: number | null; latencyMs: number; error: string | null }

export interface ModelInfo { name: string; sizeBytes: number; remote: boolean; loadedVramBytes: number | null; expiresAt: string | null }

export interface AgentCfg {
  id: string; name: string; role: string; model: string; system: string;
  context_projects: string[]; context_files: string[]; think: boolean; num_ctx: number;
}
export interface Launcher {
  id: string; name: string; kind: "url" | "app" | "folder" | "file" | "editor";
  target: string; mode: string; key: string; favorite: number | null; group: string;
}
export interface Course { code: string; title: string; days: number[]; start: number; end: number; room: string; folder: string | null }
export interface Schedule { semester: string; firstDay: string; courses: Course[] }
export interface Stats { memUsed: number; memTotal: number; cpu: number; uptimeSecs: number }
export type Stage = "wishlist" | "applied" | "oa" | "interview" | "offer" | "rejected";
export interface Application { id: string; company: string; role: string; stage: Stage; link: string; note: string; updated: string }

export interface Reference { kind: "url" | "video" | "note"; value: string }
export interface Mission {
  id: string; title: string; brief: string; references: Reference[]; created: string;
  status: "draft" | "running" | "done" | "failed" | "cancelled" | "interrupted"; model: string; finished: string | null;
}
export interface MissionSummary { mission: Mission; sources: number; verified: number; findings: number }
export interface Finding { question: string; claim: string; quote: string; url: string; source: number | null; verified: boolean }
export interface Source { n: number; url: string; title: string; primary: boolean; chars: number }
export type MissionEvent =
  | { type: "phase"; phase: string; detail: string }
  | { type: "agent"; agent: string; status: string; detail: string }
  | { type: "source"; n: number; url: string; title: string; primary: boolean }
  | { type: "finding"; agent: string; claim: string; verified: boolean }
  | { type: "log"; text: string }
  | { type: "done"; verified: number; total: number; sources: number }
  | { type: "error"; message: string };
export interface Envelope { missionId: string; at: string; event: MissionEvent }
export interface MissionDetail { mission: Mission; report: string | null; findings: Finding[]; sources: Source[]; events: Envelope[] }

export interface Opportunity {
  id: string; messageId: string; received: string; emailSubject: string;
  kind: "internship" | "job" | "event" | "message" | "deadline" | "other";
  title: string; employer: string; location: string; pay: string; deadline: string; link: string; summary: string;
  score: number; reasons: string; eligible: "yes" | "no" | "unknown"; status: "new" | "saved" | "dismissed" | "added";
}
export interface Feed { items: Opportunity[]; lastScan: string | null; lastSource: string; dropDir: string }
export interface ScanResult { emails: number; newEmails: number; newItems: number; source: string; warning: string | null }
export interface ScanEvent { stage: string; detail: string; done: number; total: number }

export interface AgentProfile { id: string; name: string; role: "orchestrator" | "project" | "directory" | "specialist"; scope: string; model: string; seed: number; accent: string }
export interface DirNode { name: string; path: string; files: number; dirs: number; commits30d: number; hasDocs: boolean }
export interface FileNode { name: string; size: number; modified: string | null; commits30d: number }
export interface DirScan {
  path: string; name: string; rel: string; projectId: string; projectName: string; crumbs: [string, string][];
  children: DirNode[]; files: FileNode[]; docs: string[]; commits: { at: string; subject: string; files: number }[];
  dirty: number; languages: [string, number][]; agent: AgentProfile;
}
export type AgentEvent =
  | { type: "tool"; agent: string; agentName: string; tool: string; detail: string }
  | { type: "delegate"; to: string; toName: string; question: string }
  | { type: "delegateDone"; to: string; chars: number }
  | { type: "answer"; text: string; model: string; steps: number };

export interface TaskInput { channel: string; project: string; topic: string; opportunityId: string; jobText: string; recipient: string; identity: string; account: string }
export interface Account { id: string; platform: string; handle: string; route: "n8n" | "metricool" | "manual"; n8nWorkflowId: string; metricoolBrand: string }
export interface Identity { id: string; name: string; kind: "personal" | "business"; voice: string; projects: string[]; banned: string[]; rules: string[]; accent: string; accounts: Account[] }
export interface Draft { id: string; channel: string; label: string; text: string; basis: string; flags: string[]; status: "review" | "approved" | "rejected" | "used" }
export interface Task {
  id: string; kind: "post" | "resume" | "outreach"; title: string; goal: string;
  status: "running" | "review" | "done" | "failed"; created: string; finished: string | null;
  input: TaskInput; drafts: Draft[]; notes: string[]; log: string[]; error: string | null; model: string;
}
export interface ResumeInfo { exists: boolean; words: number; updated: string | null; path: string }

export interface Approval {
  id: string; title: string; summary: string; text: string; channel: string; workflow: string; resumeUrl: string;
  status: "pending" | "approved" | "rejected" | "failed"; created: string; decided: string | null; error: string | null; flags: string[];
}
export interface N8nWorkflow { id: string; name: string; active: boolean; updated: string; atlas: boolean }
export interface N8nExecution { id: string; workflowId: string; status: string; mode: string; started: string; stopped: string | null }
export interface N8nStatus { reachable: boolean; hasKey: boolean; via: string; url: string; workflows: N8nWorkflow[]; executions: N8nExecution[]; error: string | null }
export interface Note { at: string; title: string; body: string; source: string }

export interface Config {
  summon_hotkey: string;
  research_model: string;
  search_url: string;
  editor_app: string;
  courses_file: string;
  school_root: string;
  launchers: Launcher[];
  ollama_url: string;
  projects: { id: string; name: string; path: string; roadmap: string; sentry_projects: string[]; accent: string; tagline: string }[];
  sentry: { base_url: string; org: string };
  revenue: { source: string; revenuecat_project_id: string; currency: string };
  health_checks: { name: string; url: string }[];
  agents: AgentCfg[];
}
export interface SecretStatus { name: string; label: string; configured: boolean }

export type ChatEvent =
  | { type: "thinking"; text: string }
  | { type: "token"; text: string }
  | { type: "done"; evalCount: number; tokensPerSec: number; cancelled: boolean };
export interface ChatMsg { role: "user" | "assistant"; content: string }


// ---- CODE: Java interview practice ----
export interface CodeProg {
  status: "" | "attempted" | "solved"; attempts: number; solves: number; lastAttempt: string | null; lastSolved: string | null;
  intervalDays: number; due: string | null; hintsUsed: number; revealed: boolean; bestSecs: number | null; slow: boolean;
}
export interface CodeProblemSummary { id: string; title: string; pattern: string; difficulty: "easy" | "medium" | "hard"; target: string; tags: string[]; progress: CodeProg; due: boolean }
export interface CodePatternStat { id: string; total: number; solved: number; due: number; mastery: number }
export interface CodeAttempt { at: string; id: string; title: string; pattern: string; full: boolean; passed: boolean; solved: boolean; mock: boolean; cases: number; total: number; verdict: string; slope: number | null; hints: number; revealed: boolean; secs: number; compiled: boolean }
export interface CodeOverview {
  java: string | null; problems: CodeProblemSummary[]; patterns: CodePatternStat[];
  plan: { due: string[]; next: string | null; nextReason: string; drills: string[] };
  streak: number; practicedToday: boolean; solved: number; drillsCorrect: number; drillsTotal: number;
  recent: CodeAttempt[]; mocks: Scorecard[];
}
export interface PatternGuide { id: string; name: string; short: string; idea: string; signals: string[]; skeleton: string; pitfalls: string[]; complexity: string }
export interface ToolkitSection { title: string; items: { name: string; code: string; note: string }[] }
export interface CodeTarget { time: string; space: string; note: string }
export interface ProblemView {
  id: string; title: string; pattern: string; difficulty: "easy" | "medium" | "hard"; statement: string;
  examples: { input: string; output: string }[]; constraints: string[]; params: string[]; target: CodeTarget;
  benchN: string; hasBench: boolean; hintCount: number; tags: string[]; starter: string; code: string; progress: CodeProg; hints: string[];
}
export interface CaseResult { i: number; ok: boolean; ms: number; input: string[]; want: string; got: string | null; error: string | null; line: number | null; stdout: string | null }
export interface CompileError { line: number; msg: string; context: string }
export interface BenchPt { n: number; ns: number; refNs: number }
export interface Complexity { slope: number | null; refSlope: number | null; label: string; target: string; verdict: "ok" | "slow" | "timeout" | "fast"; ratio: number | null; atN: number | null; detail: string }
export interface Lint { line: number; rule: string; msg: string; severity: "warn" | "info" }
export interface RunResult {
  id: string; full: boolean; compiled: boolean; compileErrors: CompileError[]; cases: CaseResult[];
  stressOk: boolean | null; stressCount: number; stressFail: CaseResult | null; bench: BenchPt[]; complexity: Complexity | null;
  lint: Lint[]; passed: boolean; solved: boolean; broken: string | null; judgeMs: number; progress: CodeProg | null;
}
export interface Reveal { explain: string; code: string; followups: string[]; target: CodeTarget }
export interface DrillView { id: string; topic: string; title: string; difficulty: string; code: string; attempts: number; correct: boolean }
export interface DrillVerdict { correct: boolean; formatOnly: boolean; output: string; explanation: string }
export interface Score { score: number; why: string; evidence: string }
export interface Scorecard {
  id: string; problemId: string; title: string; at: string; elapsedSecs: number;
  correctness: Score; efficiency: Score; codeQuality: Score; communication: Score; problemSolving: Score;
  overall: number; strengths: string[]; improve: string[]; notes: string[]; transcript?: ChatMsg[];
}
export interface InterviewCtx { code: string; lastRun: RunResult | null; elapsedSecs: number; hintsUsed: number; mode: "mock" | "tutor" }

export const api = {
  config: () => invoke<{ path: string; config: Config }>("config_get"),
  saveConfig: (config: Config) => invoke<void>("config_set", { config }),
  projects: () => invoke<Project[]>("projects_status"),
  createRoadmap: (projectId: string) => invoke<string>("roadmap_create", { projectId }),
  sentry: () => invoke<SentryOverview>("sentry_overview"),
  revenue: () => invoke<RevenueOverview>("revenue_overview"),
  health: () => invoke<Health[]>("health_checks"),
  models: () => invoke<ModelInfo[]>("ollama_models"),
  secrets: () => invoke<SecretStatus[]>("secret_status"),
  setSecret: (name: string, value: string) => invoke<void>("secret_set", { name, value }),
  clearSecret: (name: string) => invoke<void>("secret_clear", { name }),
  launch: (id: string) => invoke<void>("launch", { id }),
  icon: (id: string) => invoke<string | null>("launcher_icon", { id }),
  schedule: () => invoke<Schedule>("schedule"),
  openCourseFolder: (code: string) => invoke<void>("open_course_folder", { code }),
  stats: () => invoke<Stats>("system_stats"),
  applications: () => invoke<Application[]>("applications_get"),
  saveApplications: (apps: Application[]) => invoke<void>("applications_set", { apps }),
  missions: () => invoke<MissionSummary[]>("missions_list"),
  mission: (id: string) => invoke<MissionDetail>("mission_get", { id }),
  createMission: (title: string, brief: string, references: Reference[]) => invoke<string>("mission_create", { title, brief, references }),
  runMission: (id: string) => invoke<void>("mission_run", { id }),
  cancelMission: (id: string) => invoke<void>("mission_cancel", { id }),
  deleteMission: (id: string) => invoke<void>("mission_delete", { id }),
  onMissionEvent: (f: (e: Envelope) => void) => listen<Envelope>("mission-event", (e) => f(e.payload)),
  scanInbox: () => invoke<ScanResult>("inbox_scan"),
  opportunities: () => invoke<Feed>("opportunities_get"),
  setOpportunity: (id: string, status: Opportunity["status"]) => invoke<void>("opportunity_set_status", { id, status }),
  onInboxEvent: (f: (e: ScanEvent) => void) => listen<ScanEvent>("inbox-event", (e) => f(e.payload)),
  dirScan: (path: string) => invoke<DirScan>("dir_scan", { path }),
  orchestrator: () => invoke<AgentProfile>("orchestrator_profile"),
  dirChat: (scope: string, messages: { role: string; content: string }[], onEvent: (e: AgentEvent) => void) => {
    const ch = new Channel<AgentEvent>();
    ch.onmessage = onEvent;
    return invoke<string>("dir_agent_chat", { scope, messages, onEvent: ch });
  },
  tasks: () => invoke<Task[]>("tasks_list"),
  createTask: (kind: Task["kind"], title: string, input: Partial<TaskInput>, goal = "") =>
    invoke<string>("task_create", { kind, title, goal, input: { channel: "", project: "", topic: "", opportunityId: "", jobText: "", recipient: "", identity: "", account: "", ...input } }),
  updateDraft: (taskId: string, draftId: string, patch: { text?: string; status?: Draft["status"] }) =>
    invoke<Task>("task_draft_update", { taskId, draftId, text: patch.text ?? null, status: patch.status ?? null }),
  deleteTask: (taskId: string) => invoke<void>("task_delete", { taskId }),
  copyText: (text: string) => invoke<void>("copy_text", { text }),
  resumeInfo: () => invoke<ResumeInfo>("resume_info"),
  onTaskEvent: (f: (t: Task) => void) => listen<Task>("task-event", (e) => f(e.payload)),
  approvals: () => invoke<Approval[]>("approvals_list"),
  decide: (id: string, approve: boolean, text?: string) => invoke<Approval>("approval_decide", { id, approve, text: text ?? null }),
  n8n: () => invoke<N8nStatus>("n8n_status"),
  n8nSetActive: (id: string, active: boolean) => invoke<void>("n8n_set_active", { id, active }),
  n8nInstall: (force = false) => invoke<string[]>("n8n_install_templates", { force }),
  n8nRun: (id: string) => invoke<string>("n8n_run", { id }),
  notes: () => invoke<Note[]>("notes_list"),
  onApproval: (f: (a: Approval) => void) => listen<Approval>("approval-event", (e) => f(e.payload)),
  onNotify: (f: (n: { title: string; body: string }) => void) => listen<{ title: string; body: string }>("atlas-notify", (e) => f(e.payload)),
  identities: () => invoke<Identity[]>("identities_get"),
  saveIdentities: (list: Identity[]) => invoke<void>("identities_save", { list }),
  connectN8n: (identityId: string, accountId: string) => invoke<{ workflowId: string; editorUrl: string }>("account_connect_n8n", { identityId, accountId }),
  postVia: (identityId: string, accountId: string, text: string) => invoke<string>("post_via_account", { identityId, accountId, text }),
  codeOverview: () => invoke<CodeOverview>("code_overview"),
  codePatterns: () => invoke<PatternGuide[]>("code_patterns"),
  codeToolkit: () => invoke<ToolkitSection[]>("code_toolkit"),
  codeOpen: (id: string) => invoke<ProblemView>("code_open", { id }),
  codeSaveDraft: (id: string, code: string) => invoke<void>("code_save_draft", { id, code }),
  codeRun: (id: string, code: string, full: boolean, elapsedSecs: number, mock = false) => invoke<RunResult>("code_run", { id, code, full, elapsedSecs, mock }),
  codeHint: (id: string, level: number) => invoke<string>("code_hint", { id, level }),
  codeReveal: (id: string) => invoke<Reveal>("code_reveal", { id }),
  codeDrills: () => invoke<DrillView[]>("code_drills"),
  codeDrillAnswer: (id: string, answer: string) => invoke<DrillVerdict>("code_drill_answer", { id, answer }),
  codeInterviewer: (requestId: string, problemId: string, messages: ChatMsg[], ctx: InterviewCtx, onEvent: (e: ChatEvent) => void) => {
    const ch = new Channel<ChatEvent>();
    ch.onmessage = onEvent;
    return invoke<void>("code_interviewer", { requestId, problemId, messages, ctx, onEvent: ch });
  },
  codeMockFinish: (problemId: string, transcript: ChatMsg[], lastRun: RunResult | null, elapsedSecs: number) =>
    invoke<Scorecard>("code_mock_finish", { problemId, transcript, lastRun, elapsedSecs }),
  cancelChat: (requestId: string) => invoke<void>("agent_cancel", { requestId }),
  chat: (requestId: string, agentId: string, messages: ChatMsg[], think: boolean, onEvent: (e: ChatEvent) => void) => {
    const ch = new Channel<ChatEvent>();
    ch.onmessage = onEvent;
    return invoke<void>("agent_chat", { requestId, agentId, messages, think, onEvent: ch });
  },
};
