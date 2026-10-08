import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_FILTER } from '@/api/contract';
import { api } from '@/api/client';
import { createDb, resetDb } from '@/mocks/db';
import { restHandlers } from '@/mocks/handlers';
import { updateSettings } from '@/mocks/settings';
import { makeStore } from '@/store';
import { pushed } from '@/store/history';
import { allMatchingSelected, selectedCount, toggled } from '@/store/selection';
import { startBulkMove, undoBulk } from './actions';

const server = setupServer(...restHandlers);
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

let store: ReturnType<typeof makeStore>;
beforeEach(() => {
  resetDb(createDb({ size: 300, seed: 3 }));
  updateSettings({ latencyMin: 0, latencyMax: 0, writeFailureRate: 0, readFailureRate: 0, viewingAs: 'r1' });
  store = makeStore();
});

describe('injected failures in the fake API', () => {
  it('the load failure rate fails every read with a 500', async () => {
    updateSettings({ readFailureRate: 1 });
    const page = { snapshotId: null, offset: 0, limit: 10 };
    await expect(api.page(DEFAULT_FILTER, page)).rejects.toMatchObject({ status: 500 });
    await expect(api.stageCounts(DEFAULT_FILTER)).rejects.toMatchObject({ status: 500 });
    updateSettings({ readFailureRate: 0 });
    await expect(api.page(DEFAULT_FILTER, page)).resolves.toMatchObject({ offset: 0 });
  });

  it('the write failure rate also fails starting a bulk move and marking seen', async () => {
    updateSettings({ writeFailureRate: 1 });
    await expect(
      api.startBulk({ toStage: 'lost', target: { kind: 'items', items: [{ id: 1, stage: 'contacted' }] } }),
    ).rejects.toMatchObject({ status: 500 });
    expect((await api.markSeen(1)).status).toBe(500);
  });
});

describe('bulk start failures', () => {
  it('a failed start keeps the selection and says nothing changed', async () => {
    updateSettings({ writeFailureRate: 1 });
    store.dispatch(toggled({ id: 1, stage: 'contacted' }));
    await store.dispatch(startBulkMove('lost'));
    expect(selectedCount(store.getState().selection)).toBe(1);
    expect(store.getState().ui.toast).toMatch(/Nothing was changed/);
    expect(store.getState().history).toEqual([]);
  });

  it('an expired selection asks the user to select again', async () => {
    store.dispatch(allMatchingSelected({ snapshotId: 'gone', total: 5 }));
    await store.dispatch(startBulkMove('lost'));
    expect(store.getState().ui.toast).toMatch(/changed since you selected/);
    expect(selectedCount(store.getState().selection)).toBe(0);
  });
});

describe('bulk undo failures', () => {
  it('a failed undo keeps the entry so u can try again', async () => {
    store.dispatch(pushed({ kind: 'bulk', jobId: 'j1' }));
    server.use(http.post('*/api/bulk-jobs/:id/undo', () => HttpResponse.json({ error: 'x' }, { status: 500 })));
    await store.dispatch(undoBulk('j1'));
    expect(store.getState().history).toEqual([{ kind: 'bulk', jobId: 'j1' }]);
    expect(store.getState().ui.toast).toMatch(/try again/);
  });

  it('an already-undone job drops its entry', async () => {
    store.dispatch(pushed({ kind: 'bulk', jobId: 'j1' }));
    server.use(http.post('*/api/bulk-jobs/:id/undo', () => HttpResponse.json({ error: 'x' }, { status: 409 })));
    await store.dispatch(undoBulk('j1'));
    expect(store.getState().history).toEqual([]);
    expect(store.getState().ui.toast).toMatch(/already undone/);
  });
});
