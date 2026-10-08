import { describe, expect, it } from 'vitest';
import type { BulkJob, Deal } from '@/api/contract';
import { bulkProgress, bulkStarted } from './bulk';
import { historyRemoved, pushed } from './history';
import { makeStore } from './index';
import { dealMoved, overlayConflict, saveFailed, saveSucceeded } from './overlay';
import { allMatchingSelected, pageSelected, selectedCount, toggled } from './selection';
import {
  filterChanged,
  focusMoved,
  liveStatusChanged,
  membershipChanged,
  viewRefreshed,
  viewToggled,
  viewingAsChanged,
} from './ui';

const deal = { id: 7, stage: 'contacted' } as Deal;

describe('overlay', () => {
  it('ignores results from a superseded save', () => {
    const store = makeStore();
    const first = dealMoved(deal, 'won');
    const second = dealMoved(deal, 'lost');
    store.dispatch(first);
    store.dispatch(second);
    store.dispatch(saveSucceeded({ id: 7, seq: first.payload.seq }));
    expect(store.getState().overlay[7]).toMatchObject({ toStage: 'lost', status: 'saving' });
    store.dispatch(saveFailed({ id: 7, seq: second.payload.seq }));
    expect(store.getState().overlay[7]!.status).toBe('failed');
  });

  it('keeps the original stage across repeated moves and stores teammate conflicts', () => {
    const store = makeStore();
    store.dispatch(dealMoved(deal, 'won'));
    store.dispatch(dealMoved(deal, 'lost'));
    store.dispatch(overlayConflict({ id: 7, by: 'r2', stage: 'negotiation' }));
    expect(store.getState().overlay[7]).toMatchObject({ fromStage: 'contacted', conflict: { by: 'r2' } });
  });
});

describe('selection', () => {
  it('toggles ids, and all-matching minus exclusions', () => {
    const store = makeStore();
    store.dispatch(toggled({ id: 1, stage: 'won' }));
    store.dispatch(toggled({ id: 2, stage: 'won' }));
    expect(selectedCount(store.getState().selection)).toBe(2);
    store.dispatch(allMatchingSelected({ snapshotId: 's1', total: 3412 }));
    store.dispatch(toggled({ id: 9, stage: 'won' }));
    expect(selectedCount(store.getState().selection)).toBe(3411);
    store.dispatch(toggled({ id: 9, stage: 'won' }));
    expect(selectedCount(store.getState().selection)).toBe(3412);
  });

  it('is cleared when the view changes', () => {
    const store = makeStore();
    store.dispatch(toggled({ id: 1, stage: 'won' }));
    store.dispatch(filterChanged({ q: 'x' }));
    expect(selectedCount(store.getState().selection)).toBe(0);
    store.dispatch(toggled({ id: 1, stage: 'won' }));
    store.dispatch(viewRefreshed());
    expect(selectedCount(store.getState().selection)).toBe(0);
  });
});

describe('held updates', () => {
  it('a deal that leaves and returns cancels out; refresh clears everything', () => {
    const store = makeStore();
    store.dispatch(membershipChanged({ id: 4, ghost: { by: 'r2', stage: 'won' } }));
    expect(Object.keys(store.getState().ui.pending)).toEqual(['4']);
    store.dispatch(membershipChanged({ id: 4 }));
    expect(store.getState().ui.pending).toEqual({});
    store.dispatch(membershipChanged({ id: 5 }));
    store.dispatch(viewRefreshed());
    expect(store.getState().ui.pending).toEqual({});
    expect(store.getState().ui.ghosts).toEqual({});
  });
});

const job = (over: Partial<BulkJob> = {}): BulkJob => ({
  id: 'j1',
  kind: 'move',
  toStage: 'lost',
  status: 'running',
  total: 5,
  moved: 0,
  skipped: 0,
  failed: 0,
  unchanged: 0,
  failedItems: [],
  ...over,
});

describe('selection follow-ups', () => {
  it('Shift+A escalates to all-matching only right after a page select', () => {
    const store = makeStore();
    store.dispatch(toggled({ id: 1, stage: 'won' }));
    expect(store.getState().selection.lastPage).toBe(false);
    store.dispatch(pageSelected([{ id: 2, stage: 'won' }]));
    expect(store.getState().selection.lastPage).toBe(true);
    store.dispatch(toggled({ id: 3, stage: 'won' }));
    expect(store.getState().selection.lastPage).toBe(false);
  });

  it('switching list/board clears the selection; a kept refresh does not', () => {
    const store = makeStore();
    store.dispatch(toggled({ id: 1, stage: 'won' }));
    store.dispatch(viewRefreshed({ keepSelection: true, anchorId: 1 }));
    expect(selectedCount(store.getState().selection)).toBe(1);
    expect(store.getState().ui.anchorId).toBe(1);
    store.dispatch(focusMoved(40));
    store.dispatch(viewToggled());
    expect(selectedCount(store.getState().selection)).toBe(0);
    expect(store.getState().ui.focusIndex).toBe(0);
  });
});

describe('viewing as another rep', () => {
  it("drops the previous rep's unsaved saves, undo history and bulk job", () => {
    const store = makeStore();
    store.dispatch(dealMoved(deal, 'won'));
    store.dispatch(pushed({ kind: 'bulk', jobId: 'j1' }));
    store.dispatch(bulkStarted(job()));
    store.dispatch(viewingAsChanged('r2'));
    const s = store.getState();
    expect([s.overlay, s.history, s.bulk.job]).toEqual([{}, [], null]);
  });
});

describe('bulk progress', () => {
  it('keeps a done event that arrives before the 202 response', () => {
    const store = makeStore();
    store.dispatch(bulkProgress(job({ status: 'done', moved: 5 })));
    store.dispatch(bulkStarted(job()));
    expect(store.getState().bulk.job).toMatchObject({ status: 'done', moved: 5 });
  });

  it('never goes backwards', () => {
    const store = makeStore();
    store.dispatch(bulkStarted(job()));
    store.dispatch(bulkProgress(job({ moved: 4 })));
    store.dispatch(bulkProgress(job({ moved: 2 })));
    expect(store.getState().bulk.job!.moved).toBe(4);
  });
});

describe('history', () => {
  it('removes a specific bulk entry, not the top one', () => {
    const store = makeStore();
    store.dispatch(pushed({ kind: 'bulk', jobId: 'j1' }));
    store.dispatch(pushed({ kind: 'move', id: 7, from: 'contacted', to: 'won', deal, seq: 1 }));
    store.dispatch(historyRemoved({ jobId: 'j1' }));
    expect(store.getState().history).toMatchObject([{ kind: 'move', id: 7 }]);
  });
});

describe('live connection', () => {
  it('a reconnect marks the view as possibly stale until the user refreshes', () => {
    const store = makeStore();
    store.dispatch(liveStatusChanged('reconnecting'));
    expect(store.getState().ui).toMatchObject({ liveStatus: 'reconnecting', mayHaveMissedUpdates: false });
    store.dispatch(liveStatusChanged('live'));
    expect(store.getState().ui).toMatchObject({ liveStatus: 'live', mayHaveMissedUpdates: true });
    store.dispatch(viewRefreshed());
    expect(store.getState().ui.mayHaveMissedUpdates).toBe(false);
  });

  it('the first connection is not a reconnect', () => {
    const store = makeStore();
    store.dispatch(liveStatusChanged('live'));
    expect(store.getState().ui.mayHaveMissedUpdates).toBe(false);
  });
});
