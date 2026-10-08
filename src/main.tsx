import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { queryClient } from '@/api/queryClient';
import { startMocks } from '@/mocks/browser';
import { store } from '@/store/instance';
import { startLiveFeed } from '@/sync/liveFeed';
import { App } from './App';
import './styles.css';

await startMocks();
startLiveFeed(store);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </Provider>
  </StrictMode>,
);
