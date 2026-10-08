import { setupWorker } from 'msw/browser';
import { transport } from '@/api/client';
import { handlers } from './handlers';
import { getDb } from './db';
import { startTeammates } from './teammates';

const KEEP_ACTIVE_MS = 4000;

// ponytail: re-sends MSW's own activation message. The browser may stop an idle service
// worker; the restarted worker forgets this page and passes every request through to Vite.
const reactivate = (): void => navigator.serviceWorker?.controller?.postMessage('MOCK_ACTIVATE');

export async function startMocks(): Promise<void> {
  await setupWorker(...handlers).start({ onUnhandledFrame: 'bypass', quiet: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) reactivate();
  });
  window.addEventListener('focus', reactivate);
  transport.onLost = reactivate;
  setInterval(reactivate, KEEP_ACTIVE_MS);
  getDb();
  startTeammates();
}
