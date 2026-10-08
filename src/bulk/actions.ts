import type { BulkJob, BulkRequest, Stage } from '@/api/contract';
import { STAGE_LABEL } from '@/api/contract';
import { ApiError, api } from '@/api/client';
import { queryClient } from '@/api/queryClient';
import { getViewApi } from '@/deals/viewRegistry';
import type { AppDispatch, RootState, StoreLike } from '@/store';
import { bulkProgress, bulkStarted } from '@/store/bulk';
import { historyRemoved, pushed } from '@/store/history';
import { failedSelected, selectedCount, selectionCleared } from '@/store/selection';
import { toasted, viewRefreshed } from '@/store/ui';

type Thunk = (dispatch: AppDispatch, getState: () => RootState) => Promise<void>;

const POLL_MS = 1500;
const finished = new Set<string>();

export function finishIfDone({ dispatch, getState }: StoreLike, jobId: string): void {
  const job = getState().bulk.job;
  if (job?.id !== jobId || job.status !== 'done' || finished.has(jobId)) return;
  finished.add(jobId);
  if (job.kind === 'move' && job.moved === 0) dispatch(historyRemoved({ jobId }));
  dispatch(viewRefreshed({ keepSelection: true, anchorId: getViewApi()?.getFocused()?.id }));
  void queryClient.invalidateQueries({ queryKey: ['counts'] });
  const label = job.toStage ? STAGE_LABEL[job.toStage] : '';
  dispatch(
    toasted(
      job.kind === 'move'
        ? `Moved ${job.moved.toLocaleString()} deals to ${label}`
        : `Restored ${job.moved.toLocaleString()} deals`,
    ),
  );
}

async function follow(store: StoreLike, job: BulkJob): Promise<void> {
  store.dispatch(bulkStarted(job));
  finishIfDone(store, job.id);
  // ponytail: polls only while the bar shows this job; covers a progress event lost to a socket drop
  while (store.getState().bulk.job?.id === job.id && store.getState().bulk.job?.status === 'running') {
    await new Promise((r) => setTimeout(r, POLL_MS));
    if (store.getState().bulk.job?.id !== job.id) return;
    try {
      store.dispatch(bulkProgress(await api.getBulk(job.id)));
      finishIfDone(store, job.id);
    } catch {
      // the live feed may still deliver it; the next poll retries
    }
  }
}

async function start(dispatch: AppDispatch, req: BulkRequest): Promise<BulkJob | null> {
  try {
    const job = await api.startBulk(req);
    dispatch(pushed({ kind: 'bulk', jobId: job.id }));
    return job;
  } catch (err) {
    if (err instanceof ApiError && err.status === 410) {
      dispatch(selectionCleared());
      dispatch(toasted('The list changed since you selected. Nothing was changed — please select again.'));
    } else {
      dispatch(toasted('Could not start the bulk move. Nothing was changed.'));
    }
    return null;
  }
}

export const startBulkMove =
  (toStage: Stage): Thunk =>
  async (dispatch, getState) => {
    const { selection } = getState();
    if (selectedCount(selection) === 0) return;
    const target: BulkRequest['target'] =
      selection.mode === 'all' && selection.all
        ? {
            kind: 'filter',
            snapshotId: selection.all.snapshotId,
            excludeIds: Object.keys(selection.excluded).map(Number),
          }
        : { kind: 'items', items: Object.entries(selection.ids).map(([id, stage]) => ({ id: Number(id), stage })) };
    const job = await start(dispatch, { toStage, target });
    if (!job) return;
    dispatch(selectionCleared());
    await follow({ dispatch, getState }, job);
  };

export const retryFailedBulk = (): Thunk => async (dispatch, getState) => {
  const failed = getState().bulk.job;
  if (!failed?.toStage || !failed.failedItems.length) return;
  const job = await start(dispatch, { toStage: failed.toStage, target: { kind: 'items', items: failed.failedItems } });
  if (job) await follow({ dispatch, getState }, job);
};

export const selectFailedBulk = (): Thunk => async (dispatch, getState) => {
  const job = getState().bulk.job;
  if (job?.failedItems.length) dispatch(failedSelected(job.failedItems));
};

const undoing = new Set<string>();

export const undoBulk =
  (jobId: string): Thunk =>
  async (dispatch, getState) => {
    if (undoing.has(jobId)) return;
    undoing.add(jobId);
    let job: BulkJob;
    try {
      job = await api.undoBulk(jobId);
    } catch (err) {
      const alreadyUndone = err instanceof ApiError && err.status === 409;
      if (alreadyUndone) dispatch(historyRemoved({ jobId }));
      dispatch(
        toasted(
          alreadyUndone
            ? 'That bulk move was already undone.'
            : 'Could not undo that bulk move. Nothing changed — press u to try again.',
        ),
      );
      return;
    } finally {
      undoing.delete(jobId);
    }
    dispatch(historyRemoved({ jobId }));
    await follow({ dispatch, getState }, job);
  };
