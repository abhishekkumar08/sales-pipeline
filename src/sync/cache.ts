import type { Deal, Page } from '@/api/contract';
import { queryClient } from '@/api/queryClient';

export function findCached(id: number): Deal | undefined {
  for (const [, page] of queryClient.getQueriesData<Page>({ queryKey: ['page'] })) {
    const hit = page?.items.find((d) => d.id === id);
    if (hit) return hit;
  }
  return undefined;
}

function patchPages(id: number, fn: (d: Deal) => Deal): void {
  queryClient.setQueriesData<Page>({ queryKey: ['page'] }, (page) => {
    if (!page) return page;
    const i = page.items.findIndex((d) => d.id === id);
    if (i < 0) return page;
    const items = page.items.slice();
    items[i] = fn(items[i]!);
    return { ...page, items };
  });
}

export function patchDealInCache(incoming: Deal): void {
  patchPages(incoming.id, (d) => (incoming.version >= d.version ? { ...incoming, seenVersion: d.seenVersion } : d));
}

export function patchSeenInCache(id: number, version: number): void {
  patchPages(id, (d) => ({ ...d, seenVersion: Math.max(d.seenVersion, version) }));
}
