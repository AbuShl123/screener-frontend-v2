import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load all env vars (no VITE_ prefix filter) so we can read dev-only proxy config.
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_DEV_PROXY_TARGET || 'http://localhost:8080';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        // `@/...` -> `src/...`
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      // Same-origin dev: the browser calls /api and /ws, Vite forwards them to the
      // backend. Keeps local development free of CORS entirely. Point at your own
      // backend via VITE_DEV_PROXY_TARGET in .env.local.
      proxy: {
        '/api': { target: proxyTarget, changeOrigin: true },
        '/ws': { target: proxyTarget, changeOrigin: true, ws: true },
      },
    },
  };
});
