import { STAGES, STAGE_LABEL } from '@/api/contract';
import { useSnapshot } from '@/deals/queries';
import { useAppDispatch, useAppSelector } from '@/store';
import { bulkDismissed, jobProcessed } from '@/store/bulk';
import { allMatchingSelected, selectedCount, selectionCleared } from '@/store/selection';
import { num } from '@/ui/format';
import { retryFailedBulk, selectFailedBulk, startBulkMove, undoBulk } from './actions';

export function BulkBar() {
  const dispatch = useAppDispatch();
  const selection = useAppSelector((s) => s.selection);
  const filter = useAppSelector((s) => s.ui.filter);
  const view = useAppSelector((s) => s.ui.view);
  const job = useAppSelector((s) => s.bulk.job);
  const snapshot = useSnapshot(filter);
  const count = selectedCount(selection);
  const total = snapshot.data?.total ?? 0;

  return (
    <>
      {count > 0 && (
        <div className="bulkbar" role="region" aria-label="Selection">
          <strong>{num(count)} selected</strong>
          {selection.mode === 'ids' && view === 'list' && total > count && snapshot.data && (
            <button type="button" onClick={() => dispatch(allMatchingSelected(snapshot.data!))}>
              Select all {num(total)} matching
            </button>
          )}
          <span className="spacer" />
          <span>Move to</span>
          {STAGES.map((s, i) => (
            <button key={s} type="button" onClick={() => void dispatch(startBulkMove(s))}>
              <kbd>{i + 1}</kbd> {STAGE_LABEL[s]}
            </button>
          ))}
          <button type="button" onClick={() => dispatch(selectionCleared())}>
            Clear <kbd>Esc</kbd>
          </button>
        </div>
      )}
      {job && (
        <div className="jobbar" role="status" aria-live="polite">
          {job.status === 'running' ? (
            <>
              <span>
                {job.kind === 'move'
                  ? `Moving ${num(job.total)} → ${STAGE_LABEL[job.toStage!]}`
                  : `Undoing ${num(job.total)} moves`}{' '}
                · {num(jobProcessed(job))} done · {num(job.failed)} failed
              </span>
              <progress value={jobProcessed(job)} max={Math.max(1, job.total)} />
            </>
          ) : (
            <>
              <span>
                {job.kind === 'move' ? `${num(job.moved)} moved` : `Undo complete: ${num(job.moved)} restored`} ·{' '}
                {num(job.skipped)} skipped (changed by teammates) · {num(job.failed)} failed
                {job.unchanged > 0 && job.toStage && ` · ${num(job.unchanged)} already in ${STAGE_LABEL[job.toStage]}`}
              </span>
              <span className="spacer" />
              {job.failed > 0 && (
                <>
                  <button type="button" onClick={() => void dispatch(selectFailedBulk())}>
                    Select failed
                  </button>
                  <button type="button" onClick={() => void dispatch(retryFailedBulk())}>
                    Retry failed
                  </button>
                </>
              )}
              {job.kind === 'move' && job.moved > 0 && (
                <button type="button" onClick={() => void dispatch(undoBulk(job.id))}>
                  Undo <kbd>u</kbd>
                </button>
              )}
              <button type="button" onClick={() => dispatch(bulkDismissed())}>
                Dismiss
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
