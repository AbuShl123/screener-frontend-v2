import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

/**
 * Dev server only: loads the mock injector after the app. Added to the served HTML rather than
 * imported from `src/`, so no production build can ever contain it.
 */
const devMocks = (): Plugin => ({
  name: 'dev-mocks',
  apply: 'serve',
  transformIndexHtml: () => [
    { tag: 'script', attrs: { type: 'module', src: '/src/dev/clusterMock.ts' }, injectTo: 'body' },
  ],
});

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load all env vars (no VITE_ prefix filter) so we can read dev-only proxy config.
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_DEV_PROXY_TARGET || 'http://localhost:8080';

  return {
    plugins: [react(), tailwindcss(), devMocks()],
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
