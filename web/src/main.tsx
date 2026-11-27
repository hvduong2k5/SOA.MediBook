import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { env } from '@/lib/env';
import { App } from '@/app/App';
import '@/styles/tokens.css';
import '@/styles/global.css';

async function enableMocking(): Promise<void> {
  if (!env.VITE_USE_MOCK) {
    return;
  }
  const { worker } = await import('@/mocks/browser');
  await worker.start({
    onUnhandledRequest: 'bypass',
  });
}

void enableMocking().then(() => {
  const rootEl = document.getElementById('root');
  if (!rootEl) {
    throw new Error('Root element #root not found');
  }
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
