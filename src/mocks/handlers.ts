import { HttpResponse, delay, http } from 'msw';
import { BulkRequestSchema, PatchBodySchema, paramsToFilter, type Deal } from '@/api/contract';
import {
  SnapshotGoneError,
  createBulkJob,
  createUndoJob,
  getDb,
  getJob,
  markSeen,
  patchDeal,
  queryPage,
  stageCounts,
  stepJob,
} from './db';
import { broadcast, liveConnection } from './live';
import { getSettings, randomLatency } from './settings';

const rep = (req: Request): string => req.headers.get('x-rep-id') ?? getSettings().viewingAs;
const READ_LATENCY = 120;

const withoutSeen = (d: Deal): Deal => ({ ...d, seenVersion: 0 });

const maybeFail = (kind: 'read' | 'write'): HttpResponse<{ error: string }> | null => {
  const s = getSettings();
  const rate = kind === 'read' ? s.readFailureRate : s.writeFailureRate;
  return Math.random() < rate ? HttpResponse.json({ error: `${kind} failed` }, { status: 500 }) : null;
};

function driveJob(jobId: string): void {
  const tick = (): void => {
    const db = getDb();
    const pub = stepJob(db, jobId, { chunk: 150, failureRate: getSettings().writeFailureRate / 10 });
    if (!pub) return;
    broadcast({ type: 'bulk_progress', job: pub });
    if (pub.status === 'running') setTimeout(tick, 40);
  };
  setTimeout(tick, 0);
}

export const restHandlers = [
  http.get('*/api/deals', async ({ request }) => {
    await delay(READ_LATENCY);
    const failed = maybeFail('read');
    if (failed) return failed;
    const url = new URL(request.url);
    try {
      const page = queryPage(getDb(), paramsToFilter(url.searchParams), rep(request), {
        snapshotId: url.searchParams.get('snapshotId'),
        offset: Number(url.searchParams.get('offset') ?? 0),
        limit: Number(url.searchParams.get('limit') ?? 100),
        anchorId: url.searchParams.has('anchorId') ? Number(url.searchParams.get('anchorId')) : null,
      });
      return HttpResponse.json(page);
    } catch (e) {
      if (e instanceof SnapshotGoneError) return HttpResponse.json({ error: 'snapshot expired' }, { status: 410 });
      throw e;
    }
  }),

  http.get('*/api/stage-counts', async ({ request }) => {
    await delay(READ_LATENCY);
    const failed = maybeFail('read');
    if (failed) return failed;
    const filter = paramsToFilter(new URL(request.url).searchParams);
    return HttpResponse.json(stageCounts(getDb(), filter, rep(request)));
  }),

  http.patch('*/api/deals/:id', async ({ request, params }) => {
    await delay(randomLatency());
    const failed = maybeFail('write');
    if (failed) return failed;
    const body = PatchBodySchema.parse(await request.json());
    const out = patchDeal(getDb(), Number(params.id), body, rep(request));
    if (!out) return HttpResponse.json({ error: 'not found' }, { status: 404 });
    if (!out.ok) return HttpResponse.json({ error: 'conflict', deal: out.conflict }, { status: 409 });
    if (out.change)
      broadcast({ type: 'deal_changed', before: withoutSeen(out.change.before), after: withoutSeen(out.change.after) });
    return HttpResponse.json({ deal: out.deal });
  }),

  http.post('*/api/deals/:id/seen', async ({ request, params }) => {
    await delay(READ_LATENCY);
    const failed = maybeFail('write');
    if (failed) return failed;
    markSeen(getDb(), rep(request), Number(params.id));
    return new HttpResponse(null, { status: 204 });
  }),

  http.post('*/api/bulk-jobs', async ({ request }) => {
    await delay(READ_LATENCY);
    const failed = maybeFail('write');
    if (failed) return failed;
    try {
      const job = createBulkJob(getDb(), BulkRequestSchema.parse(await request.json()), rep(request));
      driveJob(job.id);
      return HttpResponse.json(job, { status: 202 });
    } catch (e) {
      if (e instanceof SnapshotGoneError) return HttpResponse.json({ error: 'snapshot expired' }, { status: 410 });
      throw e;
    }
  }),

  http.get('*/api/bulk-jobs/:id', async ({ params }) => {
    const failed = maybeFail('read');
    if (failed) return failed;
    const job = getJob(getDb(), String(params.id));
    return job ? HttpResponse.json(job) : HttpResponse.json({ error: 'not found' }, { status: 404 });
  }),

  http.post('*/api/bulk-jobs/:id/undo', async ({ request, params }) => {
    await delay(READ_LATENCY);
    const failed = maybeFail('write');
    if (failed) return failed;
    const job = createUndoJob(getDb(), String(params.id), rep(request));
    if (!job) return HttpResponse.json({ error: 'cannot undo' }, { status: 409 });
    driveJob(job.id);
    return HttpResponse.json(job, { status: 202 });
  }),
];

export const handlers = [...restHandlers, liveConnection];
