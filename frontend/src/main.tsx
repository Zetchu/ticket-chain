import React from 'react';
import ReactDOM from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { config } from './wagmi.config';
import './index.css';

// The design system's three faces: Sora for headlines, Inter for body copy,
// JetBrains Mono for addresses, token IDs and other cryptographic detail.
import '@fontsource/sora/600.css';
import '@fontsource/sora/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Chain and P2P reads are cheap and local, but not free — don't refetch
      // on every window focus, and treat data as fresh for a few seconds so
      // navigating between pages reuses what is already loaded.
      staleTime: 5_000,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
