import type { z } from 'zod';
import {
  BulkJobSchema,
  PageSchema,
  PatchResultSchema,
  StageCountsSchema,
  filterToParams,
  type BulkJob,
  type BulkRequest,
  type Deal,
  type Filter,
  type Page,
  type PatchBody,
  type StageCounts,
} from './contract';
import { session } from './session';

const BASE = typeof location === 'undefined' ? 'http://localhost' : '';

export const transport = { onLost: (): void => undefined };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

async function request<S extends z.ZodType>(path: string, schema: S, init: RequestInit = {}): Promise<z.infer<S>> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-rep-id': session.repId, ...init.headers },
  });
  if (!res.headers.get('content-type')?.includes('json')) {
    transport.onLost();
    throw new ApiError(503, `${init.method ?? 'GET'} ${path} → not an API response`);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, `${init.method ?? 'GET'} ${path} → ${res.status}`, body);
  return schema.parse(body);
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  page: (
    filter: Filter,
    o: { snapshotId: string | null; offset: number; limit: number; anchorId?: number | null },
  ): Promise<Page> => {
    const p = filterToParams(filter);
    p.set('offset', String(o.offset));
    p.set('limit', String(o.limit));
    if (o.snapshotId) p.set('snapshotId', o.snapshotId);
    if (o.anchorId != null) p.set('anchorId', String(o.anchorId));
    return request(`/api/deals?${p}`, PageSchema);
  },
  stageCounts: (filter: Filter): Promise<StageCounts> =>
    request(`/api/stage-counts?${filterToParams(filter)}`, StageCountsSchema),
  moveDeal: (id: number, body: PatchBody): Promise<Deal> =>
    request(`/api/deals/${id}`, PatchResultSchema, json('PATCH', body)).then((r) => r.deal),
  markSeen: (id: number): Promise<Response> =>
    fetch(`${BASE}/api/deals/${id}/seen`, { method: 'POST', headers: { 'x-rep-id': session.repId } }),
  startBulk: (req: BulkRequest): Promise<BulkJob> => request('/api/bulk-jobs', BulkJobSchema, json('POST', req)),
  getBulk: (id: string): Promise<BulkJob> => request(`/api/bulk-jobs/${id}`, BulkJobSchema),
  undoBulk: (id: string): Promise<BulkJob> => request(`/api/bulk-jobs/${id}/undo`, BulkJobSchema, json('POST')),
};
