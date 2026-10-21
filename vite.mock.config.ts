// Browser-only build with Tauri IPC swapped for a real-data fixture:
//   pnpm mock   →  http://localhost:1430/?mode=school
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@tauri-apps/api/core": fileURLToPath(new URL("./mock/core.ts", import.meta.url)),
      "@tauri-apps/plugin-opener": fileURLToPath(new URL("./mock/opener.ts", import.meta.url)),
      "@tauri-apps/api/event": fileURLToPath(new URL("./mock/event.ts", import.meta.url)),
    },
  },
  server: { port: 1430, strictPort: true },
});
