import { describe, expect, it } from 'vitest';
import { DAY_MS, DEFAULT_FILTER, type Deal, type Filter } from '@/api/contract';
import { VersionGate, classifyChange, stageConflict } from './liveLogic';

const now = Date.now();
const deal = (over: Partial<Deal> = {}): Deal => ({
  id: 1,
  company: 'Acme',
  licences: 10,
  value: 1000,
  ownerId: 'r1',
  stage: 'contacted',
  stageEnteredAt: now - DAY_MS,
  version: 3,
  lastEdit: null,
  seenVersion: 0,
  ...over,
});
const ctx = (filter: Filter) => ({ filter, rep: 'r1', now });

describe('VersionGate', () => {
  it('ignores events that are not newer than what it has seen', () => {
    const g = new VersionGate();
    expect(g.accept(1, 5)).toBe(true);
    expect(g.accept(1, 4)).toBe(false);
    expect(g.accept(1, 5)).toBe(false);
    expect(g.accept(1, 6)).toBe(true);
    expect(g.accept(2, 1)).toBe(true);
  });
});

describe('classifyChange', () => {
  const stageFilter: Filter = { ...DEFAULT_FILTER, stage: 'contacted' };

  it('a deal leaving the stage filter is a leave', () => {
    const before = deal();
    const after = deal({ stage: 'lost', version: 4, lastEdit: { by: 'r2', version: 4 } });
    expect(classifyChange(before, after, undefined, ctx(stageFilter))).toEqual({ mine: false, membership: 'leave' });
  });

  it('a deal arriving in the stage filter is an enter', () => {
    const before = deal({ stage: 'new_lead' });
    const after = deal({ stage: 'contacted', version: 4, lastEdit: { by: 'r2', version: 4 } });
    expect(classifyChange(before, after, undefined, ctx(stageFilter)).membership).toBe('enter');
  });

  it('an in-place change (value edit) is not a membership change', () => {
    const before = deal();
    const after = deal({ value: 5000, version: 4, lastEdit: { by: 'r2', version: 4 } });
    expect(classifyChange(before, after, undefined, ctx(stageFilter)).membership).toBeNull();
  });

  it('my own edit is flagged as mine', () => {
    const after = deal({ stage: 'lost', version: 4, lastEdit: { by: 'r1', version: 4 } });
    expect(classifyChange(deal(), after, undefined, ctx(stageFilter)).mine).toBe(true);
  });

  it('a teammate edit to my fresh deal enters Today; once seen it does not re-enter', () => {
    const today: Filter = { ...DEFAULT_FILTER, preset: 'today' };
    const before = deal({ version: 2, lastEdit: { by: 'r2', version: 2 } });
    const after = deal({ version: 3, lastEdit: { by: 'r2', version: 3 } });
    expect(classifyChange(before, after, 2, ctx(today)).membership).toBe('enter');
    expect(classifyChange(before, after, 3, ctx(today)).membership).toBeNull();
  });
});

describe('VersionGate floor', () => {
  it('ignores an event older than the version already held in the cache', () => {
    const gate = new VersionGate();
    expect(gate.accept(1, 4, 5)).toBe(false);
    expect(gate.accept(1, 6, 5)).toBe(true);
  });
});

describe('stageConflict', () => {
  const pending = { toStage: 'won' as const };
  it('a teammate value edit while my move is pending is not a conflict', () => {
    expect(stageConflict(deal(), deal({ value: 5, version: 4 }), pending)).toBe(false);
  });
  it('a teammate stage change that differs from mine is a conflict', () => {
    expect(stageConflict(deal(), deal({ stage: 'lost', version: 4 }), pending)).toBe(true);
  });
  it('a teammate making the same move as me is not a conflict', () => {
    expect(stageConflict(deal(), deal({ stage: 'won', version: 4 }), pending)).toBe(false);
  });
  it('no pending save, no conflict', () => {
    expect(stageConflict(deal(), deal({ stage: 'lost', version: 4 }), undefined)).toBe(false);
  });
});
