import { matchesFilter, type Deal, type Filter, type Stage } from '@/api/contract';

export interface LiveCtx {
  filter: Filter;
  rep: string;
  now: number;
}

export type Membership = 'enter' | 'leave' | null;

export function classifyChange(
  before: Deal,
  after: Deal,
  cachedSeen: number | undefined,
  ctx: LiveCtx,
): { mine: boolean; membership: Membership } {
  const mine = after.lastEdit?.by === ctx.rep;
  const wasIn = matchesFilter({ ...before, seenVersion: cachedSeen ?? before.version }, ctx.filter, ctx.rep, ctx.now);
  const isIn = matchesFilter({ ...after, seenVersion: cachedSeen ?? 0 }, ctx.filter, ctx.rep, ctx.now);
  return { mine, membership: wasIn === isIn ? null : isIn ? 'enter' : 'leave' };
}

export class VersionGate {
  private latest = new Map<number, number>();

  accept(id: number, version: number, floor = 0): boolean {
    if (version <= Math.max(this.latest.get(id) ?? 0, floor)) return false;
    this.latest.set(id, version);
    return true;
  }
}

export const stageConflict = (before: Deal, after: Deal, pending: { toStage: Stage } | undefined): boolean =>
  !!pending && before.stage !== after.stage && after.stage !== pending.toStage;
