import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { api, Config, SecretStatus } from "../api";
import { useData } from "../data";
import { ErrorLine, Panel, StatusBadge } from "../components/ui";

const HELP: Record<string, string> = {
  sentry_token: "https://sentry.io/settings/account/api/auth-tokens/",
  revenuecat_key: "https://app.revenuecat.com/",
  n8n_api_key: "http://localhost:5678/settings/api",
};

function SecretRow({ s, onChange }: { s: SecretStatus; onChange: () => void }) {
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    try {
      await api.setSecret(s.name, value);
      setValue("");
      setErr(null);
      onChange();
    } catch (e) {
      setErr(String(e));
    }
  };
  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm">{s.label}</div>
          <button onClick={() => openUrl(HELP[s.name])} className="text-[11px] text-accent hover:underline">Where do I get this?</button>
        </div>
        <StatusBadge status={s.configured ? "good" : "unknown"} label={s.configured ? "In Keychain" : "Not set"} />
      </div>
      <div className="mt-2 flex gap-2">
        <input type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder={s.configured ? "Replace…" : "Paste key"}
          className="selectable flex-1 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-ink-3" autoComplete="off" spellCheck={false} />
        <button onClick={save} disabled={!value.trim()} className="rounded-lg bg-accent px-3 text-xs font-semibold text-black disabled:opacity-40">Save</button>
        {s.configured && (
          <button onClick={() => api.clearSecret(s.name).then(onChange)} className="rounded-lg bg-surface-3 px-3 text-xs">Remove</button>
        )}
      </div>
      <ErrorLine error={err} />
    </div>
  );
}

export default function Settings() {
  const { sentry, revenue } = useData();
  const [secrets, setSecrets] = useState<SecretStatus[]>([]);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [path, setPath] = useState("");
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    api.secrets().then(setSecrets).catch((e) => setErr(String(e)));
    api.config().then(({ path, config }) => { setCfg(config); setPath(path); }).catch((e) => setErr(String(e)));
  };
  useEffect(load, []);

  const afterSecret = () => { load(); sentry.refresh(); revenue.refresh(); };

  const saveCfg = async () => {
    if (!cfg) return;
    try {
      await api.saveConfig(cfg);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      sentry.refresh();
      revenue.refresh();
    } catch (e) {
      setErr(String(e));
    }
  };

  const field = (label: string, value: string, set: (v: string) => void, hint?: string) => (
    <label className="block py-2">
      <div className="text-sm">{label}</div>
      {hint && <div className="text-[11px] text-ink-3">{hint}</div>}
      <input value={value} onChange={(e) => set(e.target.value)} spellCheck={false}
        className="selectable mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-1.5 font-mono text-sm outline-none focus:border-ink-3" />
    </label>
  );

  return (
    <div className="grid max-w-5xl grid-cols-1 gap-5 lg:grid-cols-2">
      <Panel title="API keys · macOS Keychain">
        <p className="text-xs text-ink-3">Keys are stored in your login Keychain and only ever read by Atlas's Rust core. The interface can set or remove a key but never read one back.</p>
        <div className="divide-y divide-line">{secrets.map((s) => <SecretRow key={s.name} s={s} onChange={afterSecret} />)}</div>
      </Panel>

      <Panel title="Connections">
        {cfg && (
          <>
            {field("Sentry organization", cfg.sentry.org, (v) => setCfg({ ...cfg, sentry: { ...cfg.sentry, org: v } }))}
            {field("RevenueCat project ID", cfg.revenue.revenuecat_project_id,
              (v) => setCfg({ ...cfg, revenue: { ...cfg.revenue, revenuecat_project_id: v } }),
              "RevenueCat → Project settings → General (looks like proj1a2b3c4d)")}
            {field("Ollama URL", cfg.ollama_url, (v) => setCfg({ ...cfg, ollama_url: v }))}
            <div className="mt-3 flex items-center gap-3">
              <button onClick={saveCfg} className="rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-black">Save</button>
              {saved && <span className="text-xs text-ink-3">Saved</span>}
            </div>
          </>
        )}
        <div className="mt-6 border-t border-line pt-4 text-xs text-ink-3">
          Projects, agents, roadmaps and health checks live in
          <button onClick={() => revealItemInDir(path)} className="selectable ml-1 font-mono text-accent hover:underline">{path}</button>.
          Edit it and Atlas picks the change up on the next refresh.
        </div>
        <ErrorLine error={err} />
      </Panel>
    </div>
  );
}
