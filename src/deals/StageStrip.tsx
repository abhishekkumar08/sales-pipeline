import { STAGES, STAGE_LABEL } from '@/api/contract';
import { useAppDispatch, useAppSelector } from '@/store';
import { boardColumnMoved, filterChanged, focusMoved } from '@/store/ui';
import { inr, num } from '@/ui/format';
import { useStageCounts } from './queries';

export function StageStrip() {
  const dispatch = useAppDispatch();
  const filter = useAppSelector((s) => s.ui.filter);
  const board = useAppSelector((s) => s.ui.view === 'board');
  const boardColumn = useAppSelector((s) => s.ui.boardColumn);
  const counts = useStageCounts(filter);
  return (
    <nav className="strip" aria-label="Stages">
      {STAGES.map((s, i) => {
        const c = counts.data?.counts[s];
        const on = board ? boardColumn === i : filter.stage === s;
        return (
          <button
            key={s}
            type="button"
            className={on ? 'strip-item on' : 'strip-item'}
            aria-pressed={on}
            aria-label={`${STAGE_LABEL[s]}: ${c ? num(c.count) : 'loading'} deals`}
            onClick={() => {
              if (!board) return void dispatch(filterChanged({ stage: on ? null : s }));
              dispatch(boardColumnMoved(i));
              dispatch(focusMoved(0));
            }}
          >
            <span className="strip-name">
              <kbd>{i + 1}</kbd> {STAGE_LABEL[s]}
            </span>
            <span className="strip-count">{c ? num(c.count) : '–'}</span>
            <span className="strip-value">{c ? inr(c.value) : ''}</span>
          </button>
        );
      })}
    </nav>
  );
}
