import { STAGES, STAGE_LABEL } from '@/api/contract';
import { useAppDispatch } from '@/store';
import { panelOpened } from '@/store/ui';
import { commands } from './commands';

export function StageMenu() {
  const dispatch = useAppDispatch();
  return (
    <div className="modal-back" onClick={() => dispatch(panelOpened(null))}>
      <div className="modal" role="dialog" aria-label="Change stage" onClick={(e) => e.stopPropagation()}>
        <h2>Move to…</h2>
        <p className="muted">Press a number or click. Applies to the selection, or the focused deal.</p>
        {STAGES.map((s, i) => (
          <button
            key={s}
            type="button"
            autoFocus={i === 0}
            className="menu-item"
            onClick={() => {
              dispatch(panelOpened(null));
              commands.find((c) => c.id === `move-${s}`)?.run();
            }}
          >
            <kbd>{i + 1}</kbd> {STAGE_LABEL[s]}
          </button>
        ))}
      </div>
    </div>
  );
}
