import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { config } from '@/config/env';
import App from '@/App';
import '@/index.css';

// Touch config at startup so its validation runs (and fails fast) on boot.
if (config.isDev) {
  console.info('[config]', {
    apiBaseUrl: config.apiBaseUrl || '(same-origin)',
    wsBaseUrl: config.wsBaseUrl,
  });
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
