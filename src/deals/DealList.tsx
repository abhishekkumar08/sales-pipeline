import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { focusMoved } from '@/store/ui';
import { DealRow, dealDomId } from './DealRow';
import { setViewApi } from './viewRegistry';
import { useDealPages, useFocusAnchor, useSnapshot, withOverscan } from './queries';
import { useSeenOnDwell } from './useSeenOnDwell';

const ROW_HEIGHT = 40;

export function DealList() {
  const dispatch = useAppDispatch();
  const filter = useAppSelector((s) => s.ui.filter);
  const rep = useAppSelector((s) => s.ui.viewingAs);
  const focusIndex = useAppSelector((s) => s.ui.focusIndex);
  const snapshot = useSnapshot(filter);
  const total = snapshot.data?.total ?? 0;
  const pages = useDealPages(filter, snapshot.data, focusIndex);
  const parentRef = useRef<HTMLDivElement>(null);

  const virt = useVirtualizer({
    count: total,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    onChange: (v) => {
      if (v.range) pages.setRange(withOverscan(v.range, v.options.overscan));
    },
  });

  const getDealRef = useRef(pages.getDeal);
  getDealRef.current = pages.getDeal;
  const retryRef = useRef(pages.retryFailed);
  retryRef.current = pages.retryFailed;
  const virtRef = useRef(virt);
  virtRef.current = virt;
  const focusRef = useRef(focusIndex);
  focusRef.current = focusIndex;
  const totalRef = useRef(total);
  totalRef.current = total;

  useEffect(() => {
    setViewApi({
      getFocused: () => getDealRef.current(focusRef.current),
      getVisible: () => {
        const r = virtRef.current.range;
        if (!r) return [];
        const out = [];
        for (let i = r.startIndex; i <= r.endIndex; i++) {
          const d = getDealRef.current(i);
          if (d) out.push(d);
        }
        return out;
      },
      count: () => totalRef.current,
      retryFailed: () => retryRef.current(),
    });
    return () => setViewApi(null);
  }, []);

  useEffect(() => {
    if (total > 0) virt.scrollToIndex(Math.min(focusIndex, total - 1), { align: 'auto' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusIndex]);

  useEffect(() => {
    if (total > 0 && focusIndex >= total) dispatch(focusMoved(total - 1));
  }, [total, focusIndex, dispatch]);

  useFocusAnchor(snapshot);

  const focused = pages.getDeal(focusIndex);
  const focusedId = focused?.id;
  useSeenOnDwell(focused, rep);

  if (snapshot.isLoading) return <div className="empty">Loading deals…</div>;
  if (snapshot.isError)
    return (
      <div className="empty" role="alert">
        Could not load deals. <button onClick={() => void snapshot.refetch()}>Retry</button>
      </div>
    );
  if (total === 0) {
    return (
      <div className="empty">
        {filter.preset === 'today' ? 'Nothing needs your attention right now.' : 'No deals match these filters.'}
      </div>
    );
  }

  return (
    <div className="list-wrap">
      <div className="row row-head" aria-hidden="true">
        <span />
        <span className="cell-company">Company</span>
        <span className="cell-num">Licences</span>
        <span className="cell-num">Value</span>
        <span className="cell-owner">Owner</span>
        <span className="cell-stage">Stage</span>
        <span className="cell-num">In stage</span>
        <span className="cell-chips">Status</span>
      </div>
      <div
        ref={parentRef}
        className="list"
        role="listbox"
        aria-label={`Deals, ${total.toLocaleString()} rows`}
        aria-multiselectable="true"
        aria-activedescendant={focusedId ? dealDomId(focusedId) : undefined}
        tabIndex={0}
      >
        <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
          {virt.getVirtualItems().map((v) => (
            <DealRow
              key={v.key}
              index={v.index}
              deal={pages.getDeal(v.index)}
              failed={pages.failedState(v.index, virt.range?.startIndex ?? 0)}
              onRetry={pages.retryFailed}
              active={v.index === focusIndex}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: v.size,
                transform: `translateY(${v.start}px)`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
