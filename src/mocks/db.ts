import {
  DAY_MS,
  STAGES,
  compareDeals,
  isOpen,
  matchesFilter,
  stageIndex,
  type BulkJob,
  type BulkRequest,
  type Deal,
  type Filter,
  type Page,
  type PatchBody,
  type Stage,
  type StageCounts,
} from '@/api/contract';

export class SnapshotGoneError extends Error {}

interface Snapshot {
  id: string;
  ids: Int32Array;
  stages: Uint8Array;
}

interface Job {
  pub: BulkJob;
  ids: Int32Array;
  expect: Uint8Array;
  cursor: number;
  rep: string;
  movedIds: number[];
  movedPrevStage: Stage[];
  movedPrevEnteredAt: number[];
  movedVersion: number[];
  undoOf?: Job;
  undone?: boolean;
}

export interface Db {
  deals: Deal[];
  byOwner: Map<string, number[]>;
  seen: Map<string, Map<number, number>>;
  snapshots: Map<string, Snapshot>;
  jobs: Map<string, Job>;
  prevEntered: Map<number, { stage: Stage; at: number }>;
  counter: number;
}

const MAX_SNAPSHOTS = 8;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PREFIX =
  'Acme Bright Cedar Delta Ember Falcon Granite Harbor Indigo Juniper Keystone Lumen Maple Nimbus Orbit Pioneer Quartz River Summit Titan Umbra Vertex Willow Zenith Apex Borealis Cobalt Dune Echo Fjord Gale Horizon Iris Jade Kite Lotus Meridian Nova Onyx Prism Quasar Raven Sierra Tundra Unity Vista Wren Yonder Zephyr Atlas Beacon Cinder Drift Equinox Flint Glacier Haven Ion Jetty'.split(
    ' ',
  );
const NOUN =
  'Systems Logistics Foods Textiles Pharma Labs Retail Motors Energy Health Analytics Robotics Media Capital Realty Telecom Learning Travel Steel Cloud Security Payments Mobility Agro Marine Aero Chemicals Fashion Hotels Insurance Software Networks Devices Materials Dynamics Studios Brewing Packaging Power Water Cement Ceramics Tools Optics Genomics Freight Wellness Gaming Cycles Paper Plastics'.split(
    ' ',
  );
const SUFFIX = [
  'Ltd',
  'Pvt Ltd',
  'Inc',
  'Group',
  'Co',
  'Industries',
  'Solutions',
  'Partners',
  'Corp',
  'India',
  'Holdings',
  'Enterprises',
];
const STAGE_MIX: [Stage, number][] = [
  ['new_lead', 12000],
  ['contacted', 9000],
  ['demo_done', 7000],
  ['proposal_sent', 8000],
  ['negotiation', 4000],
  ['won', 5000],
  ['lost', 5000],
];

export function createDb({ size = 50_000, seed = 42, now = Date.now(), reps = 20 } = {}): Db {
  const rand = mulberry32(seed);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rand() * a.length)]!;
  const total = STAGE_MIX.reduce((n, [, c]) => n + c, 0);
  const stagePool: Stage[] = [];
  for (const [s, c] of STAGE_MIX) {
    const n = Math.round((c / total) * size);
    for (let i = 0; i < n; i++) stagePool.push(s);
  }
  while (stagePool.length < size) stagePool.push('new_lead');
  for (let i = stagePool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [stagePool[i], stagePool[j]] = [stagePool[j]!, stagePool[i]!];
  }

  const deals: Deal[] = [];
  const byOwner = new Map<string, number[]>();
  for (let i = 0; i < size; i++) {
    const licences = Math.max(1, Math.round(2 ** (rand() * 8)));
    const ownerId = `r${Math.floor(rand() * reps) + 1}`;
    const stale = rand() < 0.25;
    const days = stale ? 8 + rand() * 357 : -Math.log(1 - rand()) * 2;
    deals.push({
      id: i + 1,
      company: `${pick(PREFIX)} ${pick(NOUN)} ${pick(SUFFIX)}`,
      licences,
      value: licences * Math.round((6000 + rand() * 54000) / 100) * 100,
      ownerId,
      stage: stagePool[i]!,
      stageEnteredAt: Math.floor(now - days * DAY_MS),
      version: 1,
      lastEdit: null,
      seenVersion: 0,
    });
    const list = byOwner.get(ownerId) ?? [];
    list.push(i + 1);
    byOwner.set(ownerId, list);
  }
  return { deals, byOwner, seen: new Map(), snapshots: new Map(), jobs: new Map(), prevEntered: new Map(), counter: 0 };
}

export const getDeal = (db: Db, id: number): Deal | undefined => db.deals[id - 1];

const seenOf = (db: Db, rep: string, id: number): number => db.seen.get(rep)?.get(id) ?? 0;

export const view = (db: Db, d: Deal, rep: string): Deal => ({ ...d, seenVersion: seenOf(db, rep, d.id) });

function queryIds(db: Db, filter: Filter, rep: string): { ids: Int32Array; stages: Uint8Array } {
  const hits: Deal[] = [];
  const now = Date.now();
  for (const d of db.deals) {
    const candidate = filter.preset === 'today' ? { ...d, seenVersion: seenOf(db, rep, d.id) } : d;
    if (matchesFilter(candidate, filter, rep, now)) hits.push(d);
  }
  hits.sort(compareDeals(filter));
  return {
    ids: Int32Array.from(hits, (d) => d.id),
    stages: Uint8Array.from(hits, (d) => stageIndex(d.stage)),
  };
}

export function queryPage(
  db: Db,
  filter: Filter,
  rep: string,
  {
    snapshotId,
    offset,
    limit,
    anchorId,
  }: { snapshotId: string | null; offset: number; limit: number; anchorId?: number | null },
): Page {
  let snap = snapshotId ? db.snapshots.get(snapshotId) : undefined;
  if (snapshotId && !snap) throw new SnapshotGoneError(snapshotId);
  if (!snap) {
    snap = { id: `s${++db.counter}`, ...queryIds(db, filter, rep) };
    db.snapshots.set(snap.id, snap);
    while (db.snapshots.size > MAX_SNAPSHOTS) db.snapshots.delete(db.snapshots.keys().next().value!);
  }
  const items: Deal[] = [];
  for (let i = offset; i < Math.min(offset + limit, snap.ids.length); i++) {
    items.push(view(db, db.deals[snap.ids[i]! - 1]!, rep));
  }
  const at = anchorId != null ? snap.ids.indexOf(anchorId) : -1;
  return { snapshotId: snap.id, total: snap.ids.length, offset, items, anchorIndex: at >= 0 ? at : null };
}

export function stageCounts(db: Db, filter: Filter, rep: string): StageCounts {
  const counts = Object.fromEntries(STAGES.map((s) => [s, { count: 0, value: 0 }])) as StageCounts['counts'];
  const f = { ...filter, stage: null };
  const now = Date.now();
  for (const d of db.deals) {
    const candidate = f.preset === 'today' ? { ...d, seenVersion: seenOf(db, rep, d.id) } : d;
    if (!matchesFilter(candidate, f, rep, now)) continue;
    const c = counts[d.stage];
    c.count++;
    c.value += d.value;
  }
  return { counts };
}

export interface Change {
  before: Deal;
  after: Deal;
}

function writeDeal(d: Deal, patch: Partial<Pick<Deal, 'stage' | 'value' | 'stageEnteredAt'>>, actor: string): Change {
  const before = { ...d };
  Object.assign(d, patch);
  d.version += 1;
  d.lastEdit = { by: actor, version: d.version };
  return { before, after: { ...d } };
}

export type PatchOutcome = { ok: true; change: Change | null; deal: Deal } | { ok: false; conflict: Deal };

export function patchDeal(db: Db, id: number, body: PatchBody, actor: string): PatchOutcome | undefined {
  const d = getDeal(db, id);
  if (!d) return undefined;
  if (body.ifStage && d.stage !== body.ifStage) return { ok: false, conflict: view(db, d, actor) };
  if (d.stage === body.stage) return { ok: true, change: null, deal: view(db, d, actor) };
  const prev = db.prevEntered.get(id);
  const enteredAt = body.revert && prev?.stage === body.stage ? prev.at : Date.now();
  db.prevEntered.set(id, { stage: d.stage, at: d.stageEnteredAt });
  const change = writeDeal(d, { stage: body.stage, stageEnteredAt: enteredAt }, actor);
  return { ok: true, change, deal: view(db, d, actor) };
}

export function editValue(db: Db, id: number, value: number, actor: string): Change | undefined {
  const d = getDeal(db, id);
  if (!d || !isOpen(d.stage)) return undefined;
  return writeDeal(d, { value }, actor);
}

export function markSeen(db: Db, rep: string, id: number): number | undefined {
  const d = getDeal(db, id);
  if (!d) return undefined;
  const marks = db.seen.get(rep) ?? new Map<number, number>();
  marks.set(id, d.version);
  db.seen.set(rep, marks);
  return d.version;
}

const toPub = (job: Job): BulkJob => job.pub;

export function createBulkJob(db: Db, req: BulkRequest, rep: string): BulkJob {
  let ids: Int32Array;
  let expect: Uint8Array;
  if (req.target.kind === 'filter') {
    const snap = db.snapshots.get(req.target.snapshotId);
    if (!snap) throw new SnapshotGoneError(req.target.snapshotId);
    const skip = new Set(req.target.excludeIds);
    const keep: number[] = [];
    for (let i = 0; i < snap.ids.length; i++) if (!skip.has(snap.ids[i]!)) keep.push(i);
    ids = Int32Array.from(keep, (i) => snap.ids[i]!);
    expect = Uint8Array.from(keep, (i) => snap.stages[i]!);
  } else {
    ids = Int32Array.from(req.target.items, (i) => i.id);
    expect = Uint8Array.from(req.target.items, (i) => stageIndex(i.stage));
  }
  const job: Job = {
    pub: {
      id: `j${++db.counter}`,
      kind: 'move',
      toStage: req.toStage,
      status: 'running',
      total: ids.length,
      moved: 0,
      skipped: 0,
      failed: 0,
      unchanged: 0,
      failedItems: [],
    },
    ids,
    expect,
    cursor: 0,
    rep,
    movedIds: [],
    movedPrevStage: [],
    movedPrevEnteredAt: [],
    movedVersion: [],
  };
  db.jobs.set(job.pub.id, job);
  return toPub(job);
}

export function createUndoJob(db: Db, jobId: string, rep: string): BulkJob | undefined {
  const src = db.jobs.get(jobId);
  if (!src || src.pub.kind !== 'move' || src.pub.status !== 'done' || src.undone) return undefined;
  src.undone = true;
  const job: Job = {
    pub: {
      id: `j${++db.counter}`,
      kind: 'undo',
      toStage: null,
      status: 'running',
      total: src.movedIds.length,
      moved: 0,
      skipped: 0,
      failed: 0,
      unchanged: 0,
      failedItems: [],
    },
    ids: Int32Array.from(src.movedIds),
    expect: Uint8Array.from(src.movedIds, () => 0),
    cursor: 0,
    rep,
    movedIds: [],
    movedPrevStage: src.movedPrevStage,
    movedPrevEnteredAt: src.movedPrevEnteredAt,
    movedVersion: src.movedVersion,
    undoOf: src,
  };
  db.jobs.set(job.pub.id, job);
  return toPub(job);
}

export const getJob = (db: Db, id: string): BulkJob | undefined => db.jobs.get(id)?.pub;

export function stepJob(
  db: Db,
  jobId: string,
  { chunk = 250, failureRate = 0, rand = Math.random } = {},
): BulkJob | undefined {
  const job = db.jobs.get(jobId);
  if (!job) return undefined;
  const { pub } = job;
  const { undoOf } = job;
  const end = Math.min(job.cursor + chunk, job.ids.length);
  for (; job.cursor < end; job.cursor++) {
    const i = job.cursor;
    const d = db.deals[job.ids[i]! - 1]!;
    if (undoOf) {
      if (d.version !== undoOf.movedVersion[i] || d.stage !== undoOf.pub.toStage) {
        pub.skipped++;
        continue;
      }
      writeDeal(d, { stage: undoOf.movedPrevStage[i]!, stageEnteredAt: undoOf.movedPrevEnteredAt[i]! }, job.rep);
      pub.moved++;
      continue;
    }
    const expected = STAGES[job.expect[i]!]!;
    if (d.stage !== expected) {
      pub.skipped++;
    } else if (d.stage === pub.toStage) {
      pub.unchanged++;
    } else if (rand() < failureRate) {
      pub.failed++;
      pub.failedItems.push({ id: d.id, stage: expected });
    } else {
      const prevEnteredAt = d.stageEnteredAt;
      writeDeal(d, { stage: pub.toStage!, stageEnteredAt: Date.now() }, job.rep);
      pub.moved++;
      job.movedIds.push(d.id);
      job.movedPrevStage.push(expected);
      job.movedPrevEnteredAt.push(prevEnteredAt);
      job.movedVersion.push(d.version);
    }
  }
  if (job.cursor >= job.ids.length) pub.status = 'done';
  return { ...pub, failedItems: pub.failedItems };
}

let singleton: Db | null = null;
export const getDb = (): Db => (singleton ??= createDb());
export const resetDb = (db: Db | null): void => {
  singleton = db;
};

if (import.meta.hot) import.meta.hot.accept(() => import.meta.hot!.invalidate());
