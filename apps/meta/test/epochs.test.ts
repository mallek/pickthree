import { describe, expect, it } from 'vitest';
import { commitMismatch, epochFor, type Epoch } from '../src/epochs.js';

const SEASON: Epoch = { at: '2026-09-08T13:00:00-07:00', note: 'Season 28' };
const REBALANCE: Epoch = {
  at: '2026-10-14T00:00:00Z',
  note: 'move rebalance',
  leagues: ['great'],
  pvpokeCommit: 'abc123',
};

describe('epochFor', () => {
  it('is the newest epoch that has already started', () => {
    expect(epochFor([SEASON, REBALANCE], 'great', new Date('2026-10-20T00:00:00Z'))).toBe(REBALANCE);
    expect(epochFor([SEASON, REBALANCE], 'great', new Date('2026-09-20T00:00:00Z'))).toBe(SEASON);
  });

  it('skips an epoch that names other leagues', () => {
    expect(epochFor([SEASON, REBALANCE], 'ultra', new Date('2026-10-20T00:00:00Z'))).toBe(SEASON);
  });

  it('ignores an epoch that has not started', () => {
    expect(epochFor([REBALANCE], 'great', new Date('2026-09-20T00:00:00Z'))).toBeNull();
  });

  it('does not depend on the list being sorted', () => {
    expect(epochFor([REBALANCE, SEASON], 'great', new Date('2026-10-20T00:00:00Z'))).toBe(REBALANCE);
  });

  it('is null when there are no epochs at all', () => {
    expect(epochFor([], 'great', new Date())).toBeNull();
  });
});

describe('commitMismatch', () => {
  it('is true only when the epoch names a commit and the baked one differs', () => {
    expect(commitMismatch(REBALANCE, 'abc123')).toBe(false);
    expect(commitMismatch(REBALANCE, 'def456')).toBe(true);
    // An epoch with no expectation cannot disagree with anything.
    expect(commitMismatch(SEASON, 'def456')).toBe(false);
    expect(commitMismatch(null, 'def456')).toBe(false);
  });
});
