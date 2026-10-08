import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useEffect, useRef } from 'react';
import { STAGES, STAGE_LABEL, daysInStage, repName, type Deal, type Stage } from '@/api/contract';
import { SaveStatus } from '@/deals/SaveStatus';
import { LoadFailedNote } from '@/deals/LoadFailedNote';
import {
  useDealPages,
  useFocusAnchor,
  useSnapshot,
  useStageCounts,
  withOverscan,
  type LoadFailure,
} from '@/deals/queries';
import { useSeenOnDwell } from '@/deals/useSeenOnDwell';
import { setViewApi } from '@/deals/viewRegistry';
import { useAppDispatch, useAppSelector } from '@/store';
import { dealMoved } from '@/store/overlay';
import { boardColumnMoved, focusMoved } from '@/store/ui';
import { inr, num } from '@/ui/format';

const CARD_HEIGHT = 84;
let dragged: Deal | null = null;

function Card({
  deal,
  failed,
  onRetry,
  active,
  index,
  column,
  style,
}: {
  deal: Deal | undefined;
  failed: LoadFailure;
  onRetry: () => void;
  active: boolean;
  index: number;
  column: number;
  style: React.CSSProperties;
}) {
  const dispatch = useAppDispatch();
  const rep = useAppSelector((s) => s.ui.viewingAs);
  const overlay = useAppSelector((s) => (deal ? s.overlay[deal.id] : undefined));
  if (!deal && failed)
    return (
      <div className="card card-load-failed" style={style}>
        {failed === 'first' && <LoadFailedNote what="cards" onRetry={onRetry} />}
      </div>
    );
  if (!deal) return <div className="card card-loading" style={style} />;
  const columnStage = STAGES[column]!;
  const moved = overlay?.toStage ?? deal.stage;
  const left = moved !== columnStage;
  const mine = Boolean(overlay) || deal.lastEdit?.by === rep;
  const by = mine ? 'you' : repName(deal.lastEdit?.by ?? '');
  return (
    <div
      className={['card', active && 'row-active', left && 'row-ghost', overlay?.status === 'failed' && 'row-failed']
        .filter(Boolean)
        .join(' ')}
      style={style}
      draggable
      role="option"
      aria-selected={active}
      aria-label={`${deal.company}, ${inr(deal.value)}`}
      onDragStart={() => (dragged = deal)}
      onClick={() => {
        dispatch(boardColumnMoved(column));
        dispatch(focusMoved(index));
      }}
    >
      <strong>{deal.company}</strong>
      <span>
        {inr(deal.value)} · {repName(deal.ownerId)} · {daysInStage(deal, Date.now())}d
      </span>
      {left && (
        <span className="chip chip-ghost">
          → {STAGE_LABEL[moved]} · by {by}
        </span>
      )}
      {overlay && <SaveStatus overlay={overlay} />}
    </div>
  );
}

const Column = memo(function Column({
  stage,
  column,
  liveCount,
}: {
  stage: Stage;
  column: number;
  liveCount: number | undefined;
}) {
  const dispatch = useAppDispatch();
  const base = useAppSelector((s) => s.ui.filter);
  const activeColumn = useAppSelector((s) => s.ui.boardColumn);
  const focusIndex = useAppSelector((s) => s.ui.focusIndex);
  const filter = { ...base, stage };
  const snapshot = useSnapshot(filter);
  const total = snapshot.data?.total ?? 0;
  const isActive = activeColumn === column;
  const pages = useDealPages(filter, snapshot.data, isActive ? focusIndex : 0);
  const rep = useAppSelector((s) => s.ui.viewingAs);
  useSeenOnDwell(isActive ? pages.getDeal(focusIndex) : undefined, rep);
  useFocusAnchor(snapshot, isActive);
  const ref = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({
    count: total,
    getScrollElement: () => ref.current,
    estimateSize: () => CARD_HEIGHT,
    overscan: 6,
    onChange: (v) => v.range && pages.setRange(withOverscan(v.range, v.options.overscan)),
  });

  const getDealRef = useRef(pages.getDeal);
  getDealRef.current = pages.getDeal;
  const retryRef = useRef(pages.retryFailed);
  retryRef.current = pages.retryFailed;
  const stateRef = useRef({ focusIndex, total });
  stateRef.current = { focusIndex, total };

  useEffect(() => {
    if (!isActive) return undefined;
    setViewApi({
      getFocused: () => getDealRef.current(stateRef.current.focusIndex),
      getVisible: () => [],
      retryFailed: () => retryRef.current(),
      count: () => stateRef.current.total,
    });
    return () => setViewApi(null);
  }, [isActive]);

  useEffect(() => {
    if (isActive && total > 0) virt.scrollToIndex(Math.min(focusIndex, total - 1), { align: 'auto' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusIndex, isActive]);

  return (
    <section
      className={isActive ? 'col col-active' : 'col'}
      aria-label={STAGE_LABEL[stage]}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => {
        if (dragged && dragged.stage !== stage) dispatch(dealMoved(dragged, stage));
        dragged = null;
      }}
    >
      <h3>
        {STAGE_LABEL[stage]} <span className="muted">{num(liveCount ?? total)}</span>
      </h3>
      <div ref={ref} className="col-body" role="listbox" aria-label={`${STAGE_LABEL[stage]} deals`}>
        <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
          {virt.getVirtualItems().map((v) => (
            <Card
              key={v.key}
              deal={pages.getDeal(v.index)}
              failed={pages.failedState(v.index, virt.range?.startIndex ?? 0)}
              onRetry={pages.retryFailed}
              index={v.index}
              column={column}
              active={isActive && v.index === focusIndex}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: v.size - 8,
                transform: `translateY(${v.start}px)`,
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
});

export default function Board() {
  const filter = useAppSelector((s) => s.ui.filter);
  const counts = useStageCounts(filter);
  return (
    <div className="board">
      {STAGES.map((s, i) => (
        <Column key={s} stage={s} column={i} liveCount={counts.data?.counts[s]?.count} />
      ))}
    </div>
  );
}
