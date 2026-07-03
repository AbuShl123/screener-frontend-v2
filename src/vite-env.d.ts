/// <reference types="vite/client" />

// Typed access to the VITE_* variables the app reads at runtime.
// Keep this in sync with src/config/env.ts (the only module that reads these).
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_WS_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
