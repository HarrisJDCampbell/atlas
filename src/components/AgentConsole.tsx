import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AgentEvent, AgentProfile, api } from "../api";
import { Avatar, AgentState } from "./Avatar";
import { ErrorLine } from "./ui";

interface Turn { role: "user" | "assistant"; content: string; trace?: string[]; meta?: string }

const key = (id: string) => `atlas.agentchat.${id}`;
const load = (id: string): Turn[] => {
  try { return JSON.parse(localStorage.getItem(key(id)) ?? "[]"); } catch { return []; }
};
const save = (id: string, t: Turn[]) => {
  try { localStorage.setItem(key(id), JSON.stringify(t.slice(-40))); } catch { /* per-viewer nicety */ }
};

const ICON: Record<string, string> = { "auto-search": "⌕", search: "⌕", read_file: "▤", list_dir: "▱" };

function traceLine(e: AgentEvent): string | null {
  if (e.type === "tool") return `${ICON[e.tool] ?? "·"} ${e.agentName} · ${e.tool === "auto-search" ? "searched for" : e.tool.replace("_", " ")} ${e.detail}`;
  if (e.type === "delegate") return `→ asked ${e.toName}: ${e.question}`;
  if (e.type === "delegateDone") return `← ${e.to.startsWith("dir:") ? "answer received" : e.to}`;
  return null;
}

const SUGGEST: Record<AgentProfile["role"], string[]> = {
  specialist: ["What should I focus on here this week?", "What am I missing?", "Give me one thing to do in the next 30 minutes."],
  orchestrator: ["What's the state of every project?", "What should I work on tonight, given my classes?", "Which project has the riskiest uncommitted work?"],
  project: ["What does this project do and how is it laid out?", "What changed here in the last two weeks?", "Where should I start reading the code?"],
  directory: ["What does this folder do?", "Walk me through the most important file here.", "What's fragile or untested in here?"],
};

export default function AgentConsole({ profile, scope = "", agentId, prefill, onClose, onState, suggestions }: {
  profile: AgentProfile; scope?: string; prefill?: { text: string; nonce: number } | null;
  /** Set for a configured agent (streams, no file tools); otherwise a folder/orchestrator agent at `scope`. */
  agentId?: string; onClose?: () => void; onState?: (s: AgentState) => void; suggestions?: string[];
}) {
  const [turns, setTurns] = useState<Turn[]>(() => load(profile.id));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const lastPrefill = useRef(0);

  useEffect(() => setTurns(load(profile.id)), [profile.id]);
  useEffect(() => save(profile.id, turns), [profile.id, turns]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [turns, live]);
  useEffect(() => onState?.(busy ? "thinking" : "idle"), [busy, onState]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    setError(null);
    const history = [...turns, { role: "user" as const, content: t }];
    setTurns(history);
    setBusy(true);
    setLive([]);
    const trace: string[] = [];
    const started = performance.now();
    try {
      if (agentId) {
        let acc = "";
        setTurns((ts) => [...ts, { role: "assistant", content: "" }]);
        await api.chat(crypto.randomUUID(), agentId, history.map(({ role, content }) => ({ role, content })), false, (e) => {
          if (e.type === "token") {
            acc += e.text;
            setTurns((ts) => [...ts.slice(0, -1), { role: "assistant", content: acc }]);
          } else if (e.type === "done") {
            const secs = ((performance.now() - started) / 1000).toFixed(0);
            setTurns((ts) => [...ts.slice(0, -1), { role: "assistant", content: acc, meta: `${profile.model} · ${e.tokensPerSec.toFixed(0)} tok/s · ${secs}s` }]);
          }
        });
        return;
      }
      const answer = await api.dirChat(scope, history.map(({ role, content }) => ({ role, content })), (e) => {
        const line = traceLine(e);
        if (line) { trace.push(line); setLive([...trace]); }
        if (e.type === "answer") {
          const secs = ((performance.now() - started) / 1000).toFixed(0);
          setTurns((ts) => [...ts, { role: "assistant", content: e.text, trace: [...trace], meta: `${e.model} · ${e.steps} tool call${e.steps === 1 ? "" : "s"} · ${secs}s` }]);
        }
      });
      if (!answer) setError("The agent returned an empty answer.");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      setLive([]);
    }
  };

  useEffect(() => {
    if (prefill && prefill.nonce !== lastPrefill.current) {
      lastPrefill.current = prefill.nonce;
      send(prefill.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const roleLabel = profile.role === "orchestrator" ? "orchestrator · delegates to project agents"
    : profile.role === "project" ? "project agent · whole repo"
    : profile.role === "specialist" ? "specialist agent"
    : "folder agent · this folder only";

  return (
    <section className="hud flex h-full min-h-0 flex-col" style={{ ["--tick" as string]: `${profile.accent}aa` }}>
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Avatar seed={profile.seed} accent={profile.accent} size={44} state={busy ? "thinking" : "idle"} orchestrator={profile.role === "orchestrator"} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold">{profile.name}</div>
          <div className="truncate font-mono text-[10.5px] text-ink-3">{roleLabel} · {profile.model}</div>
        </div>
        <button onClick={() => setTurns([])} disabled={busy} className="text-[11px] text-ink-3 hover:text-ink">Clear</button>
        {onClose && <button onClick={onClose} className="kbd">esc</button>}
      </header>

      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {turns.length === 0 && !busy && (
          <div className="space-y-2">
            <p className="text-[12px] text-ink-3">
              {profile.role === "orchestrator"
                ? "Atlas answers planning questions itself and sends project questions to each project's own agent."
                : profile.role === "specialist" ? "Runs on this Mac with this mode's context."
                : `Sees only ${profile.role === "project" ? "this repo" : "this folder"}. It searches and reads files before answering, and cites paths.`}
            </p>
            {(suggestions ?? SUGGEST[profile.role]).map((q) => (
              <button key={q} onClick={() => send(q)} className="block w-full rounded-lg border border-line px-3 py-2 text-left text-[12.5px] text-ink-2 hover:border-accent/50 hover:text-ink">→ {q}</button>
            ))}
          </div>
        )}
        {turns.map((t, i) => t.role === "user" ? (
          <div key={i} className="flex justify-end"><div className="selectable max-w-[85%] whitespace-pre-wrap rounded-2xl bg-surface-3 px-3.5 py-2 text-[13px]">{t.content}</div></div>
        ) : (
          <div key={i}>
            {t.trace && t.trace.length > 0 && (
              <details className="mb-1.5">
                <summary className="cursor-pointer font-mono text-[10.5px] text-ink-4">{t.trace.length} step{t.trace.length > 1 ? "s" : ""}</summary>
                <div className="mt-1 space-y-0.5 border-l border-line pl-2 font-mono text-[10.5px] text-ink-3">{t.trace.map((l, j) => <div key={j} className="truncate">{l}</div>)}</div>
              </details>
            )}
            <div className="prose-chat text-[13px]"><Markdown remarkPlugins={[remarkGfm]}>{t.content}</Markdown></div>
            {t.meta && <div className="mt-1 font-mono text-[10px] text-ink-4">{t.meta}</div>}
          </div>
        ))}
        {busy && (
          <div className="space-y-0.5 font-mono text-[10.5px]">
            <div className="animate-pulse text-accent">{profile.name} is working…</div>
            {live.map((l, j) => <div key={j} className="truncate text-ink-3">{l}</div>)}
          </div>
        )}
        <ErrorLine error={error} />
      </div>

      <div className="border-t border-line p-3">
        <div className="flex items-end gap-2 rounded-xl border border-line-2 bg-surface-2 px-3 py-2 focus-within:border-accent/60">
          <textarea value={input} rows={2} onChange={(e) => setInput(e.target.value)} spellCheck={false}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder={`Ask ${profile.name}…`} className="selectable max-h-40 flex-1 resize-none bg-transparent text-[13px] outline-none placeholder:text-ink-4" />
          <button onClick={() => send(input)} disabled={busy || !input.trim()} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40">Ask</button>
        </div>
      </div>
    </section>
  );
}
