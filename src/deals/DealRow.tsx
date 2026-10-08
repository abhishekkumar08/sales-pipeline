import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  STAGES,
  STAGE_LABEL,
  STUCK_AFTER_DAYS,
  daysInStage,
  isOpen,
  isUnseenTeammateChange,
  repName,
  type Deal,
  type Stage,
} from '@/api/contract';
import { useAppDispatch, useAppSelector } from '@/store';
import { dealMoved } from '@/store/overlay';
import { focusMoved } from '@/store/ui';
import { isSelected, toggled } from '@/store/selection';
import { inr, num } from '@/ui/format';
import { LoadFailedNote } from './LoadFailedNote';
import type { LoadFailure } from './queries';
import { SaveStatus } from './SaveStatus';

interface Props {
  index: number;
  deal: Deal | undefined;
  failed: LoadFailure;
  onRetry: () => void;
  active: boolean;
  style: CSSProperties;
}

export const dealDomId = (id: number): string => `deal-${id}`;

function useFlash(version: number | undefined): boolean {
  const prev = useRef(version);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (prev.current !== undefined && version !== undefined && version !== prev.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1600);
      prev.current = version;
      return () => clearTimeout(t);
    }
    prev.current = version;
    return undefined;
  }, [version]);
  return flash;
}

export const DealRow = memo(function DealRow({ index, deal, failed, onRetry, active, style }: Props) {
  const dispatch = useAppDispatch();
  const rep = useAppSelector((s) => s.ui.viewingAs);
  const overlay = useAppSelector((s) => (deal ? s.overlay[deal.id] : undefined));
  const ghost = useAppSelector((s) => (deal ? s.ui.ghosts[deal.id] : undefined));
  const selected = useAppSelector((s) => (deal ? isSelected(s.selection, deal.id) : false));
  const flash = useFlash(deal?.version);

  if (!deal && failed) {
    return (
      <div
        className="row row-load-failed"
        style={style}
        role="option"
        aria-selected={false}
        aria-label="Row did not load"
      >
        <span />
        {failed === 'first' && <LoadFailedNote what="rows" onRetry={onRetry} />}
      </div>
    );
  }

  if (!deal) {
    return (
      <div
        className="row row-loading"
        style={style}
        aria-busy="true"
        role="option"
        aria-selected={false}
        aria-label="Loading deal"
      />
    );
  }

  const stage: Stage = overlay?.toStage ?? deal.stage;
  const days = daysInStage(deal, Date.now());
  const stuck = isOpen(deal.stage) && days >= STUCK_AFTER_DAYS[deal.stage];
  const unseen = isUnseenTeammateChange(deal, rep);
  const className = [
    'row',
    active && 'row-active',
    selected && 'row-selected',
    ghost && 'row-ghost',
    flash && 'row-flash',
    overlay?.status === 'failed' && 'row-failed',
  ]
    .filter(Boolean)
    .join(' ');

  // The checkbox and stage menu are mouse shortcuts; the row's label, aria-selected and the keys carry the same.
  return (
    <div
      id={dealDomId(deal.id)}
      role="option"
      aria-selected={selected}
      aria-label={`${deal.company}, ${STAGE_LABEL[stage]}, ${inr(deal.value)}`}
      className={className}
      style={style}
      onClick={() => dispatch(focusMoved(index))}
    >
      <input
        type="checkbox"
        tabIndex={-1}
        aria-hidden="true"
        aria-label={`Select ${deal.company}`}
        checked={selected}
        onChange={() => dispatch(toggled({ id: deal.id, stage: deal.stage }))}
      />
      <span className="cell-company">{deal.company}</span>
      <span className="cell-num">{num(deal.licences)}</span>
      <span className="cell-num">{inr(deal.value)}</span>
      <span className="cell-owner">{repName(deal.ownerId)}</span>
      <select
        className="cell-stage"
        tabIndex={-1}
        aria-hidden="true"
        aria-label={`Stage of ${deal.company}`}
        value={stage}
        onChange={(e) => dispatch(dealMoved(deal, e.target.value as Stage))}
      >
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABEL[s]}
          </option>
        ))}
      </select>
      <span className="cell-num">{days}d</span>
      <span className="cell-chips">
        {overlay && <SaveStatus overlay={overlay} />}
        {ghost && (
          <span className="chip chip-ghost">
            Moved to {STAGE_LABEL[ghost.stage]} by {repName(ghost.by)}
          </span>
        )}
        {unseen && !ghost && <span className="chip chip-changed">Changed by {repName(deal.lastEdit!.by)}</span>}
        {stuck && <span className="chip chip-stuck">Stuck {days}d</span>}
      </span>
    </div>
  );
});
