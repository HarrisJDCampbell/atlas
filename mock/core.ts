// Mock of @tauri-apps/api/core for rendering the UI in a plain browser
// (screenshots, design review). Serves real data dumped by `cargo test dump_fixture`.
import fixture from "./fixture.json";

const fx = fixture as Record<string, unknown> & { icons: Record<string, string | null> };

export class Channel<T> {
  onmessage: (m: T) => void = () => {};
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (cmd === "launcher_icon") return (fx.icons[args?.id as string] ?? null) as T;
  if (cmd in fx) return fx[cmd] as T;
  return undefined as T;
}
