import { ws } from 'msw';
import type { LiveEvent } from '@/api/contract';

export const live = ws.link('*/api/live');

let downUntil = 0;

export const liveConnection = live.addEventListener('connection', ({ client }) => {
  if (Date.now() < downUntil) client.close();
});

export function dropLive(ms: number): void {
  downUntil = Date.now() + ms;
  live.clients.forEach((c) => c.close());
}

export const broadcast = (e: LiveEvent): void => live.broadcast(JSON.stringify(e));
