import { describe, expect, it } from 'vitest';
import { recentOpponents, yourMetaStats } from '../../src/yourmeta/stats.js';
import type { BattleSet, LoggedBattle, Season } from '../../src/yourmeta/types.js';

const seasons: Season[] = [{ id: 28, name: 'Twilight Trails', start: '2026-09-08T13:00:00-07:00' }];
const now = new Date('2026-09-16T00:00:00Z');

let n = 0;
function b(at: string, opponents: string[], result: 'win' | 'loss' | null): LoggedBattle {
  n += 1;
  return { id: `b${n}`, at, opponents, result, tanked: result === null };
}
function set(id: string, team: [string, string, string], battles: LoggedBattle[]): BattleSet {
  return {
    id,
    league: 'great',
    startedAt: battles[0]?.at ?? '',
    team: { species: team },
    battles,
    closed: false,
  };
}

const sets: BattleSet[] = [
  set(
    's1',
    ['tinkaton', 'azumarill', 'clodsire'],
    [
      b('2026-09-10T10:00:00Z', ['medicham', 'dragonite_shadow'], 'win'),
      b('2026-09-10T10:10:00Z', ['medicham'], 'loss'),
      b('2026-09-10T10:20:00Z', ['furret'], null),
      b('2026-09-10T10:30:00Z', [], 'win'),
    ],
  ),
  set(
    's2',
    ['clodsire', 'tinkaton', 'azumarill'],
    [b('2026-09-12T10:00:00Z', ['dragonite_shadow'], 'loss')],
  ),
  set(
    'old',
    ['feraligatr', 'morpeko', 'stunfisk_galarian'],
    [b('2026-08-01T10:00:00Z', ['skarmory'], 'win')],
  ),
];

describe('yourMetaStats', () => {
  const stats = yourMetaStats({ sets, seasons, freshFrom: null, fallback: ['a', 'b'], now });

  it('counts battles, sightings and records per species this season', () => {
    expect(stats.current.label).toBe('Twilight Trails');
    expect(stats.current.battles).toBe(4);
    expect(stats.current.sightings).toBe(4);
    // Equal faced and losses: the tie breaks on species id.
    expect(stats.current.species).toEqual([
      { speciesId: 'dragonite_shadow', faced: 2, wins: 1, losses: 1 },
      { speciesId: 'medicham', faced: 2, wins: 1, losses: 1 },
    ]);
  });

  it('rolls the same three species into one team regardless of order', () => {
    expect(stats.current.teams).toHaveLength(1);
    expect(stats.current.teams[0]).toMatchObject({
      key: 'azumarill+clodsire+tinkaton',
      battles: 4,
      wins: 2,
      losses: 2,
    });
    expect(stats.current.teams[0]?.team.species).toEqual(['tinkaton', 'azumarill', 'clodsire']);
  });

  it('keeps earlier seasons apart', () => {
    expect(stats.earlier).toHaveLength(1);
    expect(stats.earlier[0]?.label).toBe('Before Twilight Trails');
    expect(stats.earlier[0]?.species).toEqual([
      { speciesId: 'skarmory', faced: 1, wins: 1, losses: 0 },
    ]);
  });

  it('scores recent opponents: meta rank first, then sightings across all seasons, tanked included', () => {
    // a and b are the meta by rank (worth 5 and 3.5); Shadow Dragonite and Medicham were seen
    // twice each (Dragonite more recently), the rest once.
    expect(stats.recent.slice(0, 4)).toEqual(['a', 'b', 'dragonite_shadow', 'medicham']);
    expect(new Set(stats.recent)).toEqual(
      new Set(['a', 'b', 'medicham', 'dragonite_shadow', 'furret', 'skarmory']),
    );
  });

  it('reports the open set for the league', () => {
    expect(stats.openSet?.id).toBe('s1');
  });

  it('sorts species by faced then by losses', () => {
    const s = yourMetaStats({
      sets: [
        set(
          'x',
          ['a', 'b', 'c'],
          [
            b('2026-09-10T10:00:00Z', ['p'], 'loss'),
            b('2026-09-10T10:01:00Z', ['q'], 'win'),
            b('2026-09-10T10:02:00Z', ['q'], 'win'),
            b('2026-09-10T10:03:00Z', ['r'], 'loss'),
          ],
        ),
      ],
      seasons,
      freshFrom: null,
      fallback: [],
      now,
    });
    expect(s.current.species.map((x) => x.speciesId)).toEqual(['q', 'p', 'r']);
  });
});

describe('recentOpponents', () => {
  it('falls back to the given list when the log is empty', () => {
    expect(recentOpponents([], ['tinkaton', 'azumarill'], 20)).toEqual(['tinkaton', 'azumarill']);
  });
  it('one sighting lifts a meta species but does not pass the rank 1 entry', () => {
    const one = set('o', ['a', 'b', 'c'], [b('2026-09-10T10:00:00Z', ['clodsire'], 'win')]);
    // Priors 5, 3.5, 2.9; Clodsire's sighting adds 1 and lifts it past Azumarill only.
    expect(recentOpponents([one], ['tinkaton', 'azumarill', 'clodsire'], 20)).toEqual([
      'tinkaton',
      'clodsire',
      'azumarill',
    ]);
    expect(recentOpponents([one], ['tinkaton', 'azumarill', 'clodsire'], 2)).toEqual([
      'tinkaton',
      'clodsire',
    ]);
  });

  it('a single off-meta sighting does not push a top-15 meta species out; repeats do', () => {
    const meta = Array.from({ length: 20 }, (_, i) => `m${i + 1}`);
    const once = set('o', ['a', 'b', 'c'], [b('2026-09-10T10:00:00Z', ['stray'], 'win')]);
    expect(recentOpponents([once], meta, 15)).toEqual(meta.slice(0, 15));
    const twice = set(
      't',
      ['a', 'b', 'c'],
      [b('2026-09-10T10:00:00Z', ['stray'], 'win'), b('2026-09-10T10:05:00Z', ['stray'], 'loss')],
    );
    const list = recentOpponents([twice], meta, 15);
    expect(list).toContain('stray');
    expect(list).not.toContain('m15');
    // Three sightings outrank everything but the top two (5 and 3.5).
    const thrice = set(
      'h',
      ['a', 'b', 'c'],
      [
        b('2026-09-10T10:00:00Z', ['stray'], 'win'),
        b('2026-09-10T10:05:00Z', ['stray'], 'loss'),
        b('2026-09-10T10:10:00Z', ['stray'], 'win'),
      ],
    );
    expect(recentOpponents([thrice], meta, 15).indexOf('stray')).toBe(2);
  });

  it('sightings fade with the battles after them', () => {
    const filler = Array.from({ length: 200 }, (_, i) =>
      b(
        `2026-09-11T${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
        ['filler'],
        'win',
      ),
    );
    const s1 = set(
      's',
      ['a', 'b', 'c'],
      [
        b('2026-09-10T10:00:00Z', ['old'], 'win'),
        b('2026-09-10T10:01:00Z', ['old'], 'win'),
        b('2026-09-10T10:02:00Z', ['old'], 'win'),
        ...filler,
        b('2026-09-12T10:00:00Z', ['fresh'], 'win'),
      ],
    );
    const list = recentOpponents([s1], [], 10);
    expect(list.indexOf('fresh')).toBeLessThan(list.indexOf('old'));
  });

  it('uses overall ranks when given, so a ranked species outside the meta group has a prior', () => {
    const one = set('o', ['a', 'b', 'c'], [b('2026-09-10T10:00:00Z', ['skarmory'], 'win')]);
    const withRanks = recentOpponents([one], ['tinkaton', 'azumarill'], 3, {
      tinkaton: 1,
      azumarill: 2,
      skarmory: 3,
    });
    // Skarmory: rank 3 prior 2.9 plus one sighting beats Azumarill's 3.5.
    expect(withRanks).toEqual(['tinkaton', 'skarmory', 'azumarill']);
  });
  it('caps the list', () => {
    const many = set(
      'm',
      ['a', 'b', 'c'],
      Array.from({ length: 30 }, (_, i) =>
        b(`2026-09-10T10:${String(i).padStart(2, '0')}:00Z`, [`sp${i}`], 'win'),
      ),
    );
    expect(recentOpponents([many], [], 20)).toHaveLength(20);
    expect(recentOpponents([many], [], 20)[0]).toBe('sp29');
  });
});
