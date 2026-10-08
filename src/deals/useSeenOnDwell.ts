import { useEffect } from 'react';
import { isUnseenTeammateChange, type Deal } from '@/api/contract';
import { api } from '@/api/client';
import { patchSeenInCache } from '@/sync/cache';

const SEEN_DWELL_MS = 700;

export function useSeenOnDwell(focused: Deal | undefined, rep: string): void {
  const needsSeen = focused ? isUnseenTeammateChange(focused, rep) : false;
  const id = focused?.id;
  const version = focused?.version;
  useEffect(() => {
    if (id === undefined || version === undefined || !needsSeen) return undefined;
    const t = setTimeout(() => {
      // A failed mark is harmless: the row stays "changed" and is marked again next time it is focused.
      api
        .markSeen(id)
        .then((res) => {
          if (res.ok) patchSeenInCache(id, version);
        })
        .catch(() => undefined);
    }, SEEN_DWELL_MS);
    return () => clearTimeout(t);
  }, [id, version, needsSeen]);
}
