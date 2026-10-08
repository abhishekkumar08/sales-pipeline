import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_FILTER, STAGES, type Filter } from '@/api/contract';
import {
  SnapshotGoneError,
  createBulkJob,
  createDb,
  createUndoJob,
  getDeal,
  markSeen,
  patchDeal,
  queryPage,
  stageCounts,
  stepJob,
  type Db,
} from './db';

let db: Db;
beforeEach(() => {
  db = createDb({ size: 3000, seed: 7 });
});

const all: Filter = DEFAULT_FILTER;
const drain = (id: string, opts = {}) => {
  for (;;) if (stepJob(db, id, { chunk: 100, ...opts })!.status === 'done') return stepJob(db, id)!;
};

describe('seed', () => {
  it('is deterministic', () => {
    const a = createDb({ size: 3000, seed: 7, now: 1e12 });
    const b = createDb({ size: 3000, seed: 7, now: 1e12 });
    expect(a.deals).toEqual(b.deals);
  });
});

describe('query engine', () => {
  it('pages are value-descending and the total matches', () => {
    const p = queryPage(db, all, 'r1', { snapshotId: null, offset: 0, limit: 50 });
    expect(p.total).toBe(3000);
    expect(p.items).toHaveLength(50);
    for (let i = 1; i < p.items.length; i++) expect(p.items[i - 1]!.value).toBeGreaterThanOrEqual(p.items[i]!.value);
  });

  it('filters by stage and minDays', () => {
    const f: Filter = { ...all, stage: 'proposal_sent', minDays: 90 };
    const p = queryPage(db, f, 'r1', { snapshotId: null, offset: 0, limit: 1000 });
    expect(p.items.length).toBe(p.total);
    expect(p.items.every((d) => d.stage === 'proposal_sent')).toBe(true);
  });

  it('snapshot freezes order but values stay live', () => {
    const first = queryPage(db, all, 'r1', { snapshotId: null, offset: 0, limit: 10 });
    const topId = first.items[0]!.id;
    patchDeal(db, topId, { stage: 'lost' }, 'r2');
    getDeal(db, topId)!.value = 1;
    const again = queryPage(db, all, 'r1', { snapshotId: first.snapshotId, offset: 0, limit: 10 });
    expect(again.items.map((d) => d.id)).toEqual(first.items.map((d) => d.id));
    expect(again.items[0]!.value).toBe(1);
    expect(again.items[0]!.stage).toBe('lost');
    const fresh = queryPage(db, all, 'r1', { snapshotId: null, offset: 0, limit: 10 });
    expect(fresh.items[0]!.id).not.toBe(topId);
  });

  it('evicted snapshots raise SnapshotGoneError', () => {
    const first = queryPage(db, all, 'r1', { snapshotId: null, offset: 0, limit: 1 });
    for (let i = 0; i < 9; i++) queryPage(db, all, 'r1', { snapshotId: null, offset: 0, limit: 1 });
    expect(() => queryPage(db, all, 'r1', { snapshotId: first.snapshotId, offset: 0, limit: 1 })).toThrow(
      SnapshotGoneError,
    );
  });

  it('stage counts ignore the stage filter and sum to the total', () => {
    const c = stageCounts(db, { ...all, stage: 'won' }, 'r1');
    expect(STAGES.reduce((n, s) => n + c.counts[s].count, 0)).toBe(3000);
  });
});

describe('Today', () => {
  const today: Filter = { ...all, preset: 'today' };
  const ids = () => queryPage(db, today, 'r1', { snapshotId: null, offset: 0, limit: 5000 }).items;

  it('contains only my open deals', () => {
    const items = ids();
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((d) => d.ownerId === 'r1' && d.stage !== 'won' && d.stage !== 'lost')).toBe(true);
  });

  it('a teammate edit enters Today and seeing it leaves', () => {
    const fresh = db.deals.find(
      (d) => d.ownerId === 'r1' && d.stage === 'new_lead' && Date.now() - d.stageEnteredAt < 86_400_000,
    )!;
    expect(ids().some((d) => d.id === fresh.id)).toBe(false);
    patchDeal(db, fresh.id, { stage: 'contacted' }, 'r2');
    expect(ids().some((d) => d.id === fresh.id)).toBe(true);
    markSeen(db, 'r1', fresh.id);
    expect(ids().some((d) => d.id === fresh.id)).toBe(false);
  });

  it('my own edit never enters Today', () => {
    const fresh = db.deals.find(
      (d) => d.ownerId === 'r1' && d.stage === 'new_lead' && Date.now() - d.stageEnteredAt < 86_400_000,
    )!;
    patchDeal(db, fresh.id, { stage: 'contacted' }, 'r1');
    expect(ids().some((d) => d.id === fresh.id)).toBe(false);
  });
});

describe('single move', () => {
  it('is idempotent and bumps the version once', () => {
    const d = db.deals[0]!;
    const to = d.stage === 'won' ? 'lost' : 'won';
    const a = patchDeal(db, d.id, { stage: to }, 'r1')!;
    const b = patchDeal(db, d.id, { stage: to }, 'r1')!;
    expect(a.ok && b.ok && a.deal.version === b.deal.version).toBe(true);
  });

  it('a revert restores how long the deal had been in its stage', () => {
    const d = db.deals.find((x) => x.stage === 'negotiation')!;
    const entered = d.stageEnteredAt;
    patchDeal(db, d.id, { stage: 'won' }, 'r1');
    patchDeal(db, d.id, { stage: 'negotiation', ifStage: 'won', revert: true }, 'r1');
    expect(getDeal(db, d.id)!.stageEnteredAt).toBe(entered);
    patchDeal(db, d.id, { stage: 'won' }, 'r1');
    patchDeal(db, d.id, { stage: 'negotiation' }, 'r1');
    expect(getDeal(db, d.id)!.stageEnteredAt).toBeGreaterThan(entered);
  });

  it('ifStage returns a conflict when a teammate moved it', () => {
    const d = db.deals[0]!;
    const from = d.stage;
    patchDeal(db, d.id, { stage: 'negotiation' === from ? 'won' : 'negotiation' }, 'r2');
    const out = patchDeal(db, d.id, { stage: from, ifStage: 'lost' }, 'r1')!;
    expect(out.ok).toBe(false);
  });
});

describe('bulk', () => {
  const seedFilter: Filter = { ...all, stage: 'proposal_sent' };

  it('moves every deal in the snapshot', () => {
    const snap = queryPage(db, seedFilter, 'r1', { snapshotId: null, offset: 0, limit: 1 });
    const job = createBulkJob(
      db,
      { target: { kind: 'filter', snapshotId: snap.snapshotId, excludeIds: [] }, toStage: 'lost' },
      'r1',
    );
    const done = drain(job.id);
    expect(done.moved).toBe(snap.total);
    expect(db.deals.filter((d) => d.stage === 'proposal_sent')).toHaveLength(0);
  });

  it('skips deals a teammate moved after the snapshot', () => {
    const snap = queryPage(db, seedFilter, 'r1', { snapshotId: null, offset: 0, limit: 3 });
    const victim = snap.items[0]!;
    patchDeal(db, victim.id, { stage: 'won' }, 'r2');
    const job = createBulkJob(
      db,
      { target: { kind: 'filter', snapshotId: snap.snapshotId, excludeIds: [] }, toStage: 'lost' },
      'r1',
    );
    const done = drain(job.id);
    expect(done.skipped).toBe(1);
    expect(done.moved).toBe(snap.total - 1);
    expect(getDeal(db, victim.id)!.stage).toBe('won');
  });

  it('honours excluded ids and reports failures with their stage', () => {
    const snap = queryPage(db, seedFilter, 'r1', { snapshotId: null, offset: 0, limit: 2 });
    const keep = snap.items[0]!.id;
    const job = createBulkJob(
      db,
      { target: { kind: 'filter', snapshotId: snap.snapshotId, excludeIds: [keep] }, toStage: 'lost' },
      'r1',
    );
    const done = drain(job.id, { failureRate: 1 });
    expect(done.total).toBe(snap.total - 1);
    expect(done.failed).toBe(snap.total - 1);
    expect(done.failedItems.every((i) => i.stage === 'proposal_sent')).toBe(true);
    expect(getDeal(db, keep)!.stage).toBe('proposal_sent');
  });

  it('undo restores previous stages but skips deals changed since', () => {
    const snap = queryPage(db, seedFilter, 'r1', { snapshotId: null, offset: 0, limit: 5 });
    const job = createBulkJob(
      db,
      { target: { kind: 'filter', snapshotId: snap.snapshotId, excludeIds: [] }, toStage: 'lost' },
      'r1',
    );
    drain(job.id);
    const touched = snap.items[0]!.id;
    patchDeal(db, touched, { stage: 'won' }, 'r2');
    const undo = createUndoJob(db, job.id, 'r1')!;
    const done = drain(undo.id);
    expect(done.skipped).toBe(1);
    expect(done.moved).toBe(snap.total - 1);
    expect(getDeal(db, touched)!.stage).toBe('won');
    expect(db.deals.filter((d) => d.stage === 'proposal_sent').length).toBe(snap.total - 1);
  });

  it('moves explicit items only when the stage still matches', () => {
    const [a, b] = db.deals.filter((d) => d.stage === 'contacted');
    patchDeal(db, b!.id, { stage: 'won' }, 'r2');
    const job = createBulkJob(
      db,
      {
        target: {
          kind: 'items',
          items: [
            { id: a!.id, stage: 'contacted' },
            { id: b!.id, stage: 'contacted' },
          ],
        },
        toStage: 'lost',
      },
      'r1',
    );
    const done = drain(job.id);
    expect(done).toMatchObject({ moved: 1, skipped: 1 });
  });

  it('deals already in the target stage count as unchanged, not moved', () => {
    const [a] = db.deals.filter((d) => d.stage === 'lost');
    const job = createBulkJob(
      db,
      { target: { kind: 'items', items: [{ id: a!.id, stage: 'lost' }] }, toStage: 'lost' },
      'r1',
    );
    expect(drain(job.id)).toMatchObject({ moved: 0, unchanged: 1 });
  });

  it('a job can only be undone once', () => {
    const [a] = db.deals.filter((d) => d.stage === 'contacted');
    const job = createBulkJob(
      db,
      { target: { kind: 'items', items: [{ id: a!.id, stage: 'contacted' }] }, toStage: 'lost' },
      'r1',
    );
    drain(job.id);
    expect(createUndoJob(db, job.id, 'r1')).toBeDefined();
    expect(createUndoJob(db, job.id, 'r1')).toBeUndefined();
  });
});

describe('anchor', () => {
  it('a new snapshot reports where the anchor deal now sits', () => {
    const first = queryPage(db, all, 'r1', { snapshotId: null, offset: 0, limit: 300 });
    const anchor = first.items[250]!;
    patchDeal(db, first.items[0]!.id, { stage: 'lost' }, 'r2');
    const next = queryPage(db, { ...all, stage: anchor.stage }, 'r1', {
      snapshotId: null,
      offset: 0,
      limit: 1,
      anchorId: anchor.id,
    });
    const page = queryPage(db, { ...all, stage: anchor.stage }, 'r1', {
      snapshotId: next.snapshotId,
      offset: next.anchorIndex!,
      limit: 1,
    });
    expect(page.items[0]!.id).toBe(anchor.id);
    expect(
      queryPage(db, { ...all, stage: 'won' }, 'r1', { snapshotId: null, offset: 0, limit: 1, anchorId: -1 })
        .anchorIndex,
    ).toBeNull();
  });
});
