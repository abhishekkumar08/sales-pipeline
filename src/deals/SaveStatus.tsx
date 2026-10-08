import { STAGE_LABEL, repName } from '@/api/contract';
import { useAppDispatch } from '@/store';
import type { Overlay } from '@/store/overlay';
import { discardSave, retrySave } from '@/sync/actions';

export function SaveStatus({ overlay }: { overlay: Overlay }) {
  const dispatch = useAppDispatch();
  if (overlay.status === 'saving') return <span className="chip chip-saving">Saving…</span>;
  if (overlay.conflict) {
    return (
      <span className="chip chip-failed" role="alert">
        {repName(overlay.conflict.by)} moved this to {STAGE_LABEL[overlay.conflict.stage]}
        <button type="button" onClick={() => retrySave(dispatch, overlay)}>
          Keep mine
        </button>
        <button type="button" onClick={() => discardSave(dispatch, overlay)}>
          Take theirs
        </button>
      </span>
    );
  }
  return (
    <span className="chip chip-failed" role="alert">
      Not saved
      <button type="button" onClick={() => retrySave(dispatch, overlay)}>
        Retry
      </button>
      <button type="button" onClick={() => discardSave(dispatch, overlay)}>
        Undo
      </button>
    </span>
  );
}
