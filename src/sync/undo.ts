import { undoBulk } from '@/bulk/actions';
import type { StoreLike } from '@/store';
import { popped } from '@/store/history';
import { dealMoved } from '@/store/overlay';
import { toasted } from '@/store/ui';
import { discardSave } from './actions';
import { findCached } from './cache';

export function undoLast({ dispatch, getState }: StoreLike, focusedId?: number): void {
  const state = getState();
  const focusedFailure = focusedId === undefined ? undefined : state.overlay[focusedId];
  if (focusedFailure?.status === 'failed') return discardSave(dispatch, focusedFailure);
  const top = state.history[state.history.length - 1];
  if (!top) return void dispatch(toasted('Nothing to undo'));
  if (top.kind === 'bulk') {
    const job = state.bulk.job;
    if (job?.id === top.jobId && job.status === 'running')
      return void dispatch(toasted('That bulk move is still running — undo it when it finishes.'));
    return void dispatch(undoBulk(top.jobId));
  }
  const o = state.overlay[top.id];
  if (o?.seq === top.seq && o.status === 'failed') return discardSave(dispatch, o);
  dispatch(popped());
  if (o?.seq === top.seq) return void dispatch(dealMoved(o.deal, top.from, { revert: true, record: false }));
  dispatch(dealMoved(findCached(top.id) ?? top.deal, top.from, { ifStage: top.to, revert: true, record: false }));
}
