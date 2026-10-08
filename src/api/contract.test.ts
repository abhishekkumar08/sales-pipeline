import { describe, expect, it } from 'vitest';
import { DAY_MS, DEFAULT_FILTER, matchesFilter, type Deal } from './contract';

const now = Date.now();
const stuckDeal: Deal = {
  id: 1,
  company: 'Acme',
  licences: 1,
  value: 1,
  ownerId: 'r1',
  stage: 'negotiation',
  stageEnteredAt: now - 30 * DAY_MS,
  version: 1,
  lastEdit: null,
  seenVersion: 0,
};

describe('matchesFilter', () => {
  it('Today is always my deals: an owner chosen in All deals does not leak in', () => {
    expect(matchesFilter(stuckDeal, { ...DEFAULT_FILTER, preset: 'today', owner: 'r9' }, 'r1', now)).toBe(true);
    expect(matchesFilter(stuckDeal, { ...DEFAULT_FILTER, owner: 'r9' }, 'r1', now)).toBe(false);
  });
});
