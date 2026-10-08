import { z } from 'zod';

export const STAGES = ['new_lead', 'contacted', 'demo_done', 'proposal_sent', 'negotiation', 'won', 'lost'] as const;
export const StageSchema = z.enum(STAGES);
export type Stage = z.infer<typeof StageSchema>;

export const STAGE_LABEL: Record<Stage, string> = {
  new_lead: 'New Lead',
  contacted: 'Contacted',
  demo_done: 'Demo Done',
  proposal_sent: 'Proposal Sent',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
};

export const stageIndex = (s: Stage): number => STAGES.indexOf(s);
export const isOpen = (s: Stage): boolean => s !== 'won' && s !== 'lost';

export const STUCK_AFTER_DAYS: Record<Stage, number> = {
  new_lead: 3,
  contacted: 5,
  demo_done: 5,
  proposal_sent: 7,
  negotiation: 7,
  won: Infinity,
  lost: Infinity,
};

export const DAY_MS = 86_400_000;
export const PAGE_SIZE = 100;

export const LastEditSchema = z.object({
  by: z.string(),
  version: z.number(),
});
export type LastEdit = z.infer<typeof LastEditSchema>;

export const DealSchema = z.object({
  id: z.number(),
  company: z.string(),
  licences: z.number(),
  value: z.number(),
  ownerId: z.string(),
  stage: StageSchema,
  stageEnteredAt: z.number(),
  version: z.number(),
  lastEdit: LastEditSchema.nullable(),
  seenVersion: z.number(),
});
export type Deal = z.infer<typeof DealSchema>;

export const FilterSchema = z.object({
  preset: z.enum(['all', 'today']),
  stage: StageSchema.nullable(),
  owner: z.string().nullable(),
  minDays: z.number().nullable(),
  q: z.string(),
});
export type Filter = z.infer<typeof FilterSchema>;

export const DEFAULT_FILTER: Filter = { preset: 'all', stage: null, owner: null, minDays: null, q: '' };

export const filterKey = (f: Filter): string => JSON.stringify(f);

export const daysInStage = (d: Pick<Deal, 'stageEnteredAt'>, now: number): number =>
  Math.floor((now - d.stageEnteredAt) / DAY_MS);

export const isStuck = (d: Deal, now: number): boolean =>
  isOpen(d.stage) && daysInStage(d, now) >= STUCK_AFTER_DAYS[d.stage];

export const isUnseenTeammateChange = (d: Deal, rep: string): boolean =>
  d.lastEdit !== null && d.lastEdit.by !== rep && d.lastEdit.version > d.seenVersion;

export function matchesFilter(d: Deal, f: Filter, rep: string, now: number): boolean {
  if (f.stage && d.stage !== f.stage) return false;
  if (f.owner && f.preset !== 'today' && d.ownerId !== f.owner) return false;
  if (f.minDays !== null && daysInStage(d, now) < f.minDays) return false;
  if (f.q && !d.company.toLowerCase().includes(f.q.toLowerCase())) return false;
  if (f.preset === 'today') {
    if (d.ownerId !== rep || !isOpen(d.stage)) return false;
    return isStuck(d, now) || isUnseenTeammateChange(d, rep);
  }
  return true;
}

export const compareDeals =
  (f: Filter) =>
  (a: Deal, b: Deal): number => {
    if (f.preset === 'today') {
      const s = stageIndex(b.stage) - stageIndex(a.stage);
      if (s !== 0) return s;
    }
    return b.value - a.value || a.id - b.id;
  };

export const PageSchema = z.object({
  snapshotId: z.string(),
  total: z.number(),
  offset: z.number(),
  items: z.array(DealSchema),
  anchorIndex: z.number().nullable().optional(),
});
export type Page = z.infer<typeof PageSchema>;

export const StageCountsSchema = z.object({
  counts: z.record(StageSchema, z.object({ count: z.number(), value: z.number() })),
});
export type StageCounts = z.infer<typeof StageCountsSchema>;

export const PatchBodySchema = z.object({
  stage: StageSchema,
  ifStage: StageSchema.optional(),
  revert: z.boolean().optional(),
});
export type PatchBody = z.infer<typeof PatchBodySchema>;

export const PatchResultSchema = z.object({ deal: DealSchema });

export const BulkTargetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('filter'),
    snapshotId: z.string(),
    excludeIds: z.array(z.number()),
  }),
  z.object({
    kind: z.literal('items'),
    items: z.array(z.object({ id: z.number(), stage: StageSchema })),
  }),
]);
export type BulkTarget = z.infer<typeof BulkTargetSchema>;

export const BulkRequestSchema = z.object({ target: BulkTargetSchema, toStage: StageSchema });
export type BulkRequest = z.infer<typeof BulkRequestSchema>;

export const BulkJobSchema = z.object({
  id: z.string(),
  kind: z.enum(['move', 'undo']),
  toStage: StageSchema.nullable(),
  status: z.enum(['running', 'done']),
  total: z.number(),
  moved: z.number(),
  skipped: z.number(),
  failed: z.number(),
  unchanged: z.number(),
  failedItems: z.array(z.object({ id: z.number(), stage: StageSchema })),
});
export type BulkJob = z.infer<typeof BulkJobSchema>;

export const LiveEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('deal_changed'),
    before: DealSchema,
    after: DealSchema,
  }),
  z.object({ type: z.literal('bulk_progress'), job: BulkJobSchema }),
]);
export type LiveEvent = z.infer<typeof LiveEventSchema>;

export const REPS = Array.from({ length: 20 }, (_, i) => ({
  id: `r${i + 1}`,
  name: [
    'Aarav',
    'Diya',
    'Rahul',
    'Meera',
    'Kabir',
    'Ananya',
    'Vikram',
    'Isha',
    'Arjun',
    'Neha',
    'Rohan',
    'Priya',
    'Siddharth',
    'Kavya',
    'Aditya',
    'Tara',
    'Karan',
    'Sana',
    'Dev',
    'Nisha',
  ][i]!,
}));
export const repName = (id: string): string => REPS.find((r) => r.id === id)?.name ?? id;

export function filterToParams(f: Filter): URLSearchParams {
  const p = new URLSearchParams({ preset: f.preset });
  if (f.stage) p.set('stage', f.stage);
  if (f.owner) p.set('owner', f.owner);
  if (f.minDays !== null) p.set('minDays', String(f.minDays));
  if (f.q) p.set('q', f.q);
  return p;
}

export function paramsToFilter(p: URLSearchParams): Filter {
  return FilterSchema.parse({
    preset: p.get('preset') ?? 'all',
    stage: p.get('stage'),
    owner: p.get('owner'),
    minDays: p.has('minDays') ? Number(p.get('minDays')) : null,
    q: p.get('q') ?? '',
  });
}
