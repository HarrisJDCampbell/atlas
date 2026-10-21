import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { useInboxAutoScan } from "./components/HandshakeFeed";
import { LaunchProvider, useLaunch } from "./components/launch";
import Cheatsheet from "./components/Cheatsheet";
import Palette from "./components/Palette";
import Settings from "./components/Settings";
import TopBar, { Footer } from "./components/TopBar";
import { DataProvider, useData } from "./data";
import AI from "./modes/AI";
import Missions from "./modes/Missions";
import Flows from "./modes/Flows";
import Code from "./modes/Code";
import Build from "./modes/Build";
import Career from "./modes/Career";
import Orbit from "./modes/Orbit";
import Create from "./modes/Create";
import Ops from "./modes/Ops";
import School from "./modes/School";
import { ModeId, modeById, MODES } from "./modes";
import { Pending, Shell, ShellCtx } from "./shell";

const MODE_KEY = "atlas.mode";

function loadMode(): ModeId {
  const fromUrl = new URLSearchParams(location.search).get("mode") as ModeId | null;
  if (fromUrl && MODES.some((x) => x.id === fromUrl)) return fromUrl;
  try {
    const m = localStorage.getItem(MODE_KEY) as ModeId | null;
    return m && MODES.some((x) => x.id === m) ? m : "command";
  } catch {
    return "command";
  }
}

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

function Cockpit() {
  const [mode, setModeState] = useState<ModeId>(loadMode);
  const [palette, setPalette] = useState(false);
  const [settings, setSettings] = useState(false);
  const [keys, setKeys] = useState(() => new URLSearchParams(location.search).has("keys"));
  const [pending, setPending] = useState<Pending | null>(null);
  const nonce = useRef(0);
  const { launchers } = useData();
  const { fire, notify } = useLaunch();
  useInboxAutoScan(notify);
  // Workflows talk back: notes become toasts, approval requests say so wherever you are.
  useEffect(() => {
    const a = api.onNotify((n) => notify(`${n.title}${n.body ? ` — ${n.body.slice(0, 80)}` : ""}`));
    const b = api.onApproval((x) => { if (x.status === "pending") notify(`Approval needed: ${x.title} · ⌘9`); });
    return () => { a.then((f) => f()); b.then((f) => f()); };
  }, [notify]);

  const setMode = useCallback((m: ModeId) => {
    setModeState(m);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* per-viewer nicety only */ }
  }, []);

  const shell: Shell = useMemo(() => ({
    setMode,
    openSettings: () => setSettings(true),
    ask: (agentId, text) => {
      setPending({ agentId, text, nonce: ++nonce.current });
      setMode("ai");
    },
  }), [setMode]);

  // The whole room takes the mode's accent.
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", modeById(mode).accent);
  }, [mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); return; }
      if (meta && e.key === ",") { e.preventDefault(); setSettings(true); return; }
      if (meta && /^[0-9]$/.test(e.key)) {
        const m = MODES[e.key === "0" ? 9 : Number(e.key) - 1];
        if (m) { e.preventDefault(); setMode(m.id); }
        return;
      }
      if (e.key === "Escape") { setPalette(false); setSettings(false); setKeys(false); return; }
      if (meta || e.altKey || palette || settings || typing(e.target)) return;
      if (e.key === "?") { e.preventDefault(); setKeys((k) => !k); return; }
      if (keys) return;

      const list = launchers.data ?? [];
      const k = e.key.toLowerCase();
      if (/^[a-z]$/.test(k)) {
        const l = list.find((x) => x.mode === mode && x.key.toLowerCase() === k);
        if (l) { e.preventDefault(); fire(l); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, palette, settings, keys, launchers.data, fire, setMode]);

  return (
    <ShellCtx.Provider value={shell}>
      <div className="backdrop" />
      <div className="relative flex h-full flex-col">
        <TopBar mode={mode} setMode={setMode} openPalette={() => setPalette(true)} openSettings={() => setSettings(true)} />
        <main className={`min-h-0 flex-1 px-5 py-4 overflow-hidden`}>
          <div key={mode} className="mx-auto h-full max-w-[1680px]">
            {mode === "command" && <Orbit />}
            {mode === "school" && <School />}
            {mode === "build" && <Build />}
            {mode === "ops" && <Ops />}
            {mode === "career" && <Career />}
            {mode === "create" && <Create />}
            {mode === "ai" && <AI pending={pending} consumed={() => setPending(null)} />}
            {mode === "missions" && <Missions />}
            {mode === "flows" && <Flows />}
            {mode === "code" && <Code />}
          </div>
        </main>
        <Footer openKeys={() => setKeys(true)} />
      </div>
      {keys && <Cheatsheet close={() => setKeys(false)} />}
      {palette && <Palette close={() => setPalette(false)} setMode={setMode} ask={shell.ask} openSettings={() => setSettings(true)} />}
      {settings && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 py-[8vh] backdrop-blur-sm" onMouseDown={() => setSettings(false)}>
          <div className="rise w-[1000px] max-w-[92vw]" onMouseDown={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h1 className="label text-ink-2">Settings</h1>
              <button onClick={() => setSettings(false)} className="kbd">esc</button>
            </div>
            <Settings />
          </div>
        </div>
      )}
    </ShellCtx.Provider>
  );
}

export default function App() {
  return (
    <DataProvider>
      <LaunchProvider>
        <Cockpit />
      </LaunchProvider>
    </DataProvider>
  );
}
