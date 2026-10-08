import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PAGE_SIZE, filterKey, type Deal, type Filter, type Page } from '@/api/contract';
import { ApiError, api } from '@/api/client';
import { queryClient } from '@/api/queryClient';
import { useAppDispatch, useAppSelector } from '@/store';
import { focusMoved } from '@/store/ui';

export interface Snapshot {
  snapshotId: string;
  total: number;
  anchorIndex: number | null;
}

export function useSnapshot(filter: Filter) {
  const rep = useAppSelector((s) => s.ui.viewingAs);
  const epoch = useAppSelector((s) => s.ui.epoch);
  const anchorId = useAppSelector((s) => s.ui.anchorId);
  return useQuery<Snapshot>({
    queryKey: ['snapshot', rep, filterKey(filter), epoch],
    queryFn: async () => {
      const first = await api.page(filter, { snapshotId: null, offset: 0, limit: PAGE_SIZE, anchorId });
      queryClient.setQueryData(['page', first.snapshotId, 0], first);
      return { snapshotId: first.snapshotId, total: first.total, anchorIndex: first.anchorIndex ?? null };
    },
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey[1] === rep && prevQuery.queryKey[2] === filterKey(filter) ? prev : undefined,
  });
}

export function useFocusAnchor(snapshot: UseQueryResult<Snapshot>, enabled = true): void {
  const dispatch = useAppDispatch();
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const anchorIndex = snapshot.isPlaceholderData ? null : (snapshot.data?.anchorIndex ?? null);
  const snapshotId = snapshot.data?.snapshotId;
  useEffect(() => {
    if (enabledRef.current && anchorIndex !== null) dispatch(focusMoved(anchorIndex));
  }, [snapshotId, anchorIndex, dispatch]);
}

export type LoadFailure = null | 'first' | 'rest';

export const withOverscan = (r: { startIndex: number; endIndex: number }, overscan: number) => ({
  start: Math.max(0, r.startIndex - overscan),
  end: r.endIndex + overscan,
});

export function useDealPages(filter: Filter, snapshot: Snapshot | undefined, focusIndex: number) {
  const [range, setRange] = useState({ start: 0, end: 30 });
  const snapshotId = snapshot?.snapshotId ?? null;

  const pageIdx = useMemo(() => {
    const idx = new Set<number>([Math.floor(focusIndex / PAGE_SIZE)]);
    for (let p = Math.floor(range.start / PAGE_SIZE); p <= Math.floor(range.end / PAGE_SIZE); p++) idx.add(p);
    return [...idx].sort((a, b) => a - b);
  }, [range, focusIndex]);

  const results = useQueries({
    queries: pageIdx.map((p) => ({
      queryKey: ['page', snapshotId, p],
      enabled: snapshotId !== null,
      queryFn: () => api.page(filter, { snapshotId, offset: p * PAGE_SIZE, limit: PAGE_SIZE }),
    })),
  });

  const expired = results.some((r) => r.error instanceof ApiError && r.error.status === 410);
  useEffect(() => {
    if (expired) void queryClient.invalidateQueries({ queryKey: ['snapshot'] });
  }, [expired]);

  const byPage = new Map<number, Page>();
  const failed = new Set<number>();
  results.forEach((r, i) => {
    if (r.data) byPage.set(pageIdx[i]!, r.data);
    else if (r.isError) failed.add(pageIdx[i]!);
  });

  const getDeal = (i: number): Deal | undefined => byPage.get(Math.floor(i / PAGE_SIZE))?.items[i % PAGE_SIZE];
  const isFailed = (i: number): boolean => failed.has(Math.floor(i / PAGE_SIZE));
  const failedState = (i: number, firstVisible: number): LoadFailure => {
    if (!isFailed(i)) return null;
    return i >= firstVisible && (i === firstVisible || !isFailed(i - 1)) ? 'first' : 'rest';
  };
  const retryFailed = (): boolean => {
    const errored = results.filter((r) => r.isError);
    errored.forEach((r) => void r.refetch());
    return errored.length > 0;
  };
  return { getDeal, failedState, retryFailed, setRange };
}

export function useStageCounts(filter: Filter) {
  const rep = useAppSelector((s) => s.ui.viewingAs);
  const base = { ...filter, stage: null };
  return useQuery({
    queryKey: ['counts', rep, filterKey(base)],
    queryFn: () => api.stageCounts(base),
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey[1] === rep && prevQuery.queryKey[2] === filterKey(filter) ? prev : undefined,
  });
}
