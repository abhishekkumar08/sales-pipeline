import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Deal, Stage } from '@/api/contract';
import { createDb, getDeal, getDb, patchDeal, resetDb } from '@/mocks/db';
import { restHandlers } from '@/mocks/handlers';
import { updateSettings } from '@/mocks/settings';
import { makeStore } from '@/store';
import { bulkStarted } from '@/store/bulk';
import { pushed } from '@/store/history';
import { dealMoved } from '@/store/overlay';
import { saveConfig } from './saveQueue';
import { discardSave } from './actions';
import { undoLast } from './undo';

const server = setupServer(...restHandlers);
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());

let store: ReturnType<typeof makeStore>;
let deal: Deal;
beforeEach(() => {
  resetDb(createDb({ size: 300, seed: 3 }));
  updateSettings({ latencyMin: 0, latencyMax: 0, writeFailureRate: 0, viewingAs: 'r1' });
  saveConfig.backoffMs = [1, 1];
  store = makeStore();
  deal = { ...getDb().deals.find((d) => d.stage === 'contacted')!, seenVersion: 0 };
});
afterEach(() => server.resetHandlers());

const settled = async (id: number): Promise<void> => {
  const start = Date.now();
  while (store.getState().overlay[id]?.status === 'saving') {
    if (Date.now() - start > 2000) throw new Error('save never settled');
    await new Promise((r) => setTimeout(r, 2));
  }
};

const move = async (to: Stage, opts?: { ifStage?: Stage }) => {
  store.dispatch(dealMoved(deal, to, opts));
  await settled(deal.id);
};

describe('save queue', () => {
  it('saves, clears the overlay and records history', async () => {
    await move('won');
    expect(store.getState().overlay[deal.id]).toBeUndefined();
    expect(getDeal(getDb(), deal.id)!.stage).toBe('won');
    expect(store.getState().history).toMatchObject([{ kind: 'move', id: deal.id, from: 'contacted', to: 'won' }]);
  });

  it('retries twice silently and then succeeds', async () => {
    let calls = 0;
    server.use(
      http.patch('*/api/deals/:id', () => {
        calls++;
        if (calls <= 2) return HttpResponse.json({}, { status: 500 });
        return undefined;
      }),
    );
    await move('won');
    expect(calls).toBe(3);
    expect(store.getState().overlay[deal.id]).toBeUndefined();
  });

  it('after three failures the deal stays put, marked failed, and Retry works', async () => {
    updateSettings({ writeFailureRate: 1 });
    await move('won');
    const o = store.getState().overlay[deal.id]!;
    expect(o).toMatchObject({ status: 'failed', toStage: 'won' });
    expect(getDeal(getDb(), deal.id)!.stage).toBe('contacted');
    updateSettings({ writeFailureRate: 0 });
    store.dispatch(dealMoved(o.deal, o.toStage));
    await settled(deal.id);
    expect(store.getState().overlay[deal.id]).toBeUndefined();
    expect(getDeal(getDb(), deal.id)!.stage).toBe('won');
  });

  it('latest intent wins even when the older request is slower', async () => {
    const seen: string[] = [];
    server.use(
      http.patch('*/api/deals/:id', async ({ request }) => {
        const { stage } = (await request.clone().json()) as { stage: string };
        seen.push(stage);
        await new Promise((r) => setTimeout(r, stage === 'won' ? 30 : 1));
        return undefined;
      }),
    );
    store.dispatch(dealMoved(deal, 'won'));
    store.dispatch(dealMoved(deal, 'lost'));
    await settled(deal.id);
    await new Promise((r) => setTimeout(r, 60));
    expect(getDeal(getDb(), deal.id)!.stage).toBe('lost');
    expect(store.getState().overlay[deal.id]).toBeUndefined();
    expect(seen[seen.length - 1]).toBe('lost');
  });

  it('a conditional move that finds a teammate change fails with the conflict', async () => {
    patchDeal(getDb(), deal.id, { stage: 'lost' }, 'r2');
    await move('contacted', { ifStage: 'won' });
    expect(store.getState().overlay[deal.id]).toMatchObject({
      status: 'failed',
      conflict: { by: 'r2', stage: 'lost' },
    });
  });
});

describe('undo', () => {
  it('records the move the moment it is made, from the stage it was in', () => {
    updateSettings({ latencyMin: 30, latencyMax: 30 });
    store.dispatch(dealMoved(deal, 'won'));
    store.dispatch(dealMoved(deal, 'lost'));
    expect(store.getState().history).toMatchObject([
      { kind: 'move', from: 'contacted', to: 'won' },
      { kind: 'move', from: 'won', to: 'lost' },
    ]);
  });

  it('u while a move is still saving reverts that move, not the bulk before it', async () => {
    store.dispatch(pushed({ kind: 'bulk', jobId: 'j9' }));
    updateSettings({ latencyMin: 30, latencyMax: 30 });
    store.dispatch(dealMoved(deal, 'won'));
    undoLast(store);
    expect(store.getState().history).toEqual([{ kind: 'bulk', jobId: 'j9' }]);
    expect(store.getState().overlay[deal.id]!.toStage).toBe('contacted');
    await settled(deal.id);
    expect(getDeal(getDb(), deal.id)!.stage).toBe('contacted');
  });

  it('u on a bulk that is still running waits instead of undoing anything', () => {
    store.dispatch(pushed({ kind: 'bulk', jobId: 'j9' }));
    store.dispatch(
      bulkStarted({
        id: 'j9',
        kind: 'move',
        toStage: 'lost',
        status: 'running',
        total: 9,
        moved: 1,
        skipped: 0,
        failed: 0,
        unchanged: 0,
        failedItems: [],
      }),
    );
    undoLast(store);
    expect(store.getState().history).toEqual([{ kind: 'bulk', jobId: 'j9' }]);
    expect(store.getState().ui.toast).toMatch(/still running/);
  });

  it('u on a failed move discards it', async () => {
    updateSettings({ writeFailureRate: 1 });
    await move('won');
    undoLast(store);
    expect(store.getState().overlay[deal.id]).toBeUndefined();
    expect(store.getState().history).toEqual([]);
  });

  it('the Undo button on a failed save also drops its undo entry', async () => {
    updateSettings({ writeFailureRate: 1 });
    await move('won');
    discardSave(store.dispatch, store.getState().overlay[deal.id]!);
    expect(store.getState().overlay[deal.id]).toBeUndefined();
    expect(store.getState().history).toEqual([]);
  });
});
