import type { BattleSet } from '@pickthree/engine';
import { describe, expect, it } from 'vitest';
import { contributedCount } from '../src/state/contribution.ts';

const team = { species: ['tinkaton', 'azumarill', 'clodsire'] as [string, string, string] };

function set(battles: BattleSet['battles'], id = 's1'): BattleSet {
  return {
    id,
    league: 'great',
    startedAt: '2026-09-01T00:00:00Z',
    team,
    battles,
    closed: false,
  };
}

describe('contributedCount', () => {
  it('is 0 for no sets and for sets with nothing sent', () => {
    expect(contributedCount([])).toBe(0);
    expect(
      contributedCount([
        set([
          { id: 'b1', at: '2026-09-01T00:00:00Z', opponents: ['medicham'], result: 'win', tanked: false },
        ]),
      ]),
    ).toBe(0);
  });

  it('counts battles with sharedAt across sets, but never a tanked one', () => {
    const sets: BattleSet[] = [
      set(
        [
          {
            id: 'b1',
            at: '2026-09-01T00:00:00Z',
            opponents: ['medicham'],
            result: 'win',
            tanked: false,
            sharedAt: '2026-09-01T00:01:00Z',
          },
          {
            id: 'b2',
            at: '2026-09-02T00:00:00Z',
            opponents: [],
            result: null,
            tanked: true,
            sharedAt: '2026-09-02T00:01:00Z',
          },
        ],
        's1',
      ),
      set(
        [
          {
            id: 'b3',
            at: '2026-09-03T00:00:00Z',
            opponents: ['tinkaton'],
            result: 'loss',
            tanked: false,
            sharedAt: '2026-09-03T00:01:00Z',
          },
        ],
        's2',
      ),
    ];
    expect(contributedCount(sets)).toBe(2);
  });
});
