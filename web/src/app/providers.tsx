import { useEffect, useState, type ReactNode } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { createQueryClient } from '@/lib/queryClient';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { tokenStore } from '@/api/tokenStore';

interface AppProvidersProps {
  children: ReactNode;
  queryClient?: QueryClient;
}

export function AppProviders({ children, queryClient }: AppProvidersProps) {
  const [client] = useState(() => queryClient ?? createQueryClient());

  useEffect(() => {
    return tokenStore.onSessionExpired(() => {
      client.clear();
      if (window.location.pathname !== '/login') {
        window.history.replaceState(null, '', '/login');
      }
    });
  }, [client]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ErrorBoundary>
  );
}
