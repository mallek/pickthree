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

  it('lists recent opponents across all seasons, newest first, tanked included', () => {
    expect(stats.recent).toEqual(['dragonite_shadow', 'furret', 'medicham', 'skarmory']);
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
