import { createContext, useContext } from "react";
import { ModeId } from "./modes";

export interface Pending { agentId: string; text: string; nonce: number }

// App-level navigation any mode can trigger.
export interface Shell {
  setMode: (m: ModeId) => void;
  openSettings: () => void;
  /** Switch to the AI mode and send `text` to an agent. */
  ask: (agentId: string, text: string) => void;
}

export const ShellCtx = createContext<Shell | null>(null);

export function useShell(): Shell {
  const v = useContext(ShellCtx);
  if (!v) throw new Error("useShell outside ShellCtx");
  return v;
}
