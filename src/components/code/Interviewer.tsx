// The interviewer: a local model that has the problem, the hidden notes and the
// judge's facts on every turn. It talks; it never decides whether code works.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { api, ChatMsg, InterviewCtx } from "../../api";
import { AvatarG } from "../Avatar";
import { seedOf } from "../rings";

export interface InterviewerHandle { send: (text: string) => void }

const Interviewer = forwardRef<InterviewerHandle, {
  problemId: string; mode: "mock" | "tutor"; ctx: () => InterviewCtx;
  messages: ChatMsg[]; setMessages: (f: (m: ChatMsg[]) => ChatMsg[]) => void; autoOpen?: boolean;
}>(function Interviewer({ problemId, mode, ctx, messages, setMessages, autoOpen }, ref) {
  const [draft, setDraft] = useState("");
  const [live, setLive] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const req = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const opened = useRef(false);

  const ask = async (history: ChatMsg[]) => {
    const id = `iv-${Date.now()}`;
    req.current = id;
    setLive("");
    setErr(null);
    let text = "";
    try {
      await api.codeInterviewer(id, problemId, history, ctx(), (e) => {
        if (e.type === "token") { text += e.text; setLive(text); }
      });
      if (req.current === id && text.trim()) setMessages((m) => [...m, { role: "assistant", content: text.trim() }]);
    } catch (e) {
      setErr(String(e));
    } finally {
      if (req.current === id) { setLive(null); req.current = null; }
    }
  };

  const send = (t: string) => {
    const text = t.trim();
    if (!text || live !== null) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(() => next);
    setDraft("");
    void ask(next);
  };
  useImperativeHandle(ref, () => ({ send }));

  useEffect(() => {
    if (autoOpen && !opened.current && messages.length === 0) { opened.current = true; void ask([]); }
    return () => { if (req.current) void api.cancelChat(req.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [messages, live]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <svg width={30} height={30} viewBox="0 0 30 30"><AvatarG seed={seedOf("code-interviewer")} accent="#21b3c4" size={30} cx={15} cy={15} state={live !== null ? "thinking" : "idle"} /></svg>
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold">{mode === "mock" ? "Interviewer" : "Coach"}</div>
          <div className="font-mono text-[10px] text-ink-4">{mode === "mock" ? "talk through it like it's real" : "asks, nudges — won't hand you the answer"}</div>
        </div>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
        {messages.length === 0 && live === null && (
          <p className="text-[12px] text-ink-3">
            {mode === "mock" ? "The interviewer opens in a moment." : "Stuck, or want to check your thinking? Explain your approach and the coach will push on it. It reads the judge's results, so ask it about a failing case."}
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "ml-6 rounded-lg bg-surface-3 px-3 py-2 text-[12.5px] text-ink" : "prose-chat text-[12.5px] leading-relaxed text-ink-2"}>
            {m.role === "user" ? <span className="selectable whitespace-pre-wrap">{m.content}</span> : <ReactMarkdown>{m.content}</ReactMarkdown>}
          </div>
        ))}
        {live !== null && <div className="prose-chat text-[12.5px] leading-relaxed text-ink-2">{live ? <ReactMarkdown>{live}</ReactMarkdown> : <span className="animate-pulse text-accent">…</span>}</div>}
        {err && <div className="text-[11.5px] text-critical">{err.includes("unreachable") ? "Ollama isn't running — start it to talk to the interviewer. The judge works without it." : err}</div>}
      </div>
      <div className="border-t border-line p-2">
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.metaKey) { e.preventDefault(); send(draft); } }}
          placeholder={mode === "mock" ? "Think out loud — your approach, your questions…" : "Explain your idea, or ask about a failing case…"}
          className="selectable w-full resize-none rounded-md border border-line-2 bg-bg/60 px-2.5 py-2 text-[12.5px] outline-none focus:border-accent/60" />
      </div>
    </div>
  );
});

export default Interviewer;
