import { describe, expect, it } from 'vitest';
import type { BattleRow } from '../src/battles.js';
import { teamBoard, THIRDS_LIMIT } from '../src/teams.js';

const WINDOW = {
  league: 'great',
  since: '2026-09-01T00:00:00.000Z',
  until: '2026-09-30T00:00:00.000Z',
  band: 'all',
  now: new Date('2026-09-30T00:00:00.000Z'),
};

function row(over: Partial<BattleRow> = {}): BattleRow {
  return {
    device: 'd1',
    league: 'great',
    season: 28,
    at: '2026-09-10T00:00:00.000Z',
    team: ['azumarill', 'medicham', 'registeel'],
    moves: null,
    opponents: [],
    result: 'win',
    tanked: false,
    band: 'ace',
    source: 'ladder',
    ...over,
  };
}

function find(rows: readonly { species: string[] }[], ...ids: string[]) {
  const want = [...ids].sort().join('+');
  return rows.find((r) => [...r.species].sort().join('+') === want);
}

describe('teamBoard, the run side', () => {
  it('rolls the reporter own three up as a complete team, in any order', () => {
    const out = teamBoard({
      ...WINDOW,
      rows: [
        row({ team: ['azumarill', 'medicham', 'registeel'], result: 'win' }),
        row({ team: ['registeel', 'azumarill', 'medicham'], result: 'loss' }),
      ],
    });
    const t = find(out.teams, 'azumarill', 'medicham', 'registeel');
    expect(t).toBeDefined();
    expect(t?.runBattles).toBe(2);
    expect(t?.runWins).toBe(1);
    expect(t?.runLosses).toBe(1);
    expect(t?.facedBattles).toBe(0);
  });

  it('counts a complete sighting as a sighting of all three of its cores', () => {
    const out = teamBoard({ ...WINDOW, rows: [row({ result: 'win' })] });
    expect(out.cores).toHaveLength(3);
    for (const pair of [
      ['azumarill', 'medicham'],
      ['azumarill', 'registeel'],
      ['medicham', 'registeel'],
    ]) {
      const c = find(out.cores, ...pair);
      expect(c?.runBattles).toBe(1);
      expect(c?.runWins).toBe(1);
      expect(c?.kind).toBe('core');
    }
  });

  it('names the third members a core was completed by', () => {
    const out = teamBoard({
      ...WINDOW,
      rows: [
        row({ team: ['azumarill', 'medicham', 'registeel'] }),
        row({ team: ['azumarill', 'medicham', 'registeel'] }),
        row({ team: ['azumarill', 'medicham', 'lanturn'] }),
      ],
    });
    expect(find(out.cores, 'azumarill', 'medicham')?.thirds).toEqual([
      { speciesId: 'registeel', sightings: 2 },
      { speciesId: 'lanturn', sightings: 1 },
    ]);
  });

  it('caps thirds at THIRDS_LIMIT, most common first', () => {
    const rows: BattleRow[] = [];
    for (let i = 0; i < THIRDS_LIMIT + 1; i++) {
      const speciesId = `third${i}`;
      // third0 completes the pair THIRDS_LIMIT + 1 times, each next one time fewer, so the sort
      // order is unambiguous and the least common, 13th distinct third is the one dropped.
      const count = THIRDS_LIMIT + 1 - i;
      for (let n = 0; n < count; n++) {
        rows.push(row({ team: ['azumarill', 'medicham', speciesId] }));
      }
    }
    const out = teamBoard({ ...WINDOW, rows });
    const c = find(out.cores, 'azumarill', 'medicham');
    expect(c?.thirds).toHaveLength(THIRDS_LIMIT);
    expect(c?.thirds[0]).toEqual({ speciesId: 'third0', sightings: THIRDS_LIMIT + 1 });
    expect(c?.thirds.some((t) => t.speciesId === `third${THIRDS_LIMIT}`)).toBe(false);
  });

  it('carries the most common run moveset per member', () => {
    const moves = [
      { fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'] },
      null,
      null,
    ] as BattleRow['moves'];
    const rows = Array.from({ length: 6 }, () => row({ moves }));
    const out = teamBoard({ ...WINDOW, rows });
    const t = find(out.teams, 'azumarill', 'medicham', 'registeel');
    // species is sorted, so azumarill is index 0.
    expect(t?.moves[0]).toEqual({ fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'], battles: 6 });
    expect(t?.moves[1]).toBeNull();
  });
});

describe('teamBoard, the faced side', () => {
  it('records a faced team with the inverse of the reporter result', () => {
    const out = teamBoard({
      ...WINDOW,
      rows: [
        row({ opponents: ['lanturn', 'skarmory', 'shadow'], result: 'win' }),
        row({ opponents: ['skarmory', 'shadow', 'lanturn'], result: 'loss' }),
      ],
    });
    const t = find(out.teams, 'lanturn', 'skarmory', 'shadow');
    // The reporter won one and lost one, so the team they faced lost one and won one.
    expect(t?.facedBattles).toBe(2);
    expect(t?.facedWins).toBe(1);
    expect(t?.facedLosses).toBe(1);
    expect(t?.runBattles).toBe(0);
    expect(t?.moves).toEqual([null, null, null]);
  });

  it('ranks a faced pair as a 2-Pokemon core, since one or two is what gets logged', () => {
    const out = teamBoard({ ...WINDOW, rows: [row({ opponents: ['lanturn', 'skarmory'], result: 'loss' })] });
    const c = find(out.cores, 'lanturn', 'skarmory');
    expect(c?.kind).toBe('core');
    expect(c?.facedBattles).toBe(1);
    expect(c?.facedWins).toBe(1);
    expect(c?.thirds).toEqual([]);
    // A pair is not a complete team, so it never appears as one.
    expect(find(out.teams, 'lanturn', 'skarmory')).toBeUndefined();
  });

  it('gives a faced pair null moves too, not only a faced complete team', () => {
    const out = teamBoard({ ...WINDOW, rows: [row({ opponents: ['lanturn', 'skarmory'], result: 'loss' })] });
    const c = find(out.cores, 'lanturn', 'skarmory');
    expect(c?.moves).toEqual([null, null]);
  });

  it('makes no team or core out of a single opponent', () => {
    const out = teamBoard({ ...WINDOW, rows: [row({ team: ['a', 'b', 'c'], opponents: ['lanturn'] })] });
    expect(out.cores.some((c) => c.species.includes('lanturn'))).toBe(false);
    expect(out.teams.some((t) => t.species.includes('lanturn'))).toBe(false);
  });

  it('keeps run and faced counts apart on a row that is both', () => {
    const out = teamBoard({
      ...WINDOW,
      rows: [
        row({ team: ['lanturn', 'skarmory', 'shadow'], opponents: [], result: 'win' }),
        row({ team: ['a', 'b', 'c'], opponents: ['lanturn', 'skarmory', 'shadow'], result: 'win' }),
      ],
    });
    const t = find(out.teams, 'lanturn', 'skarmory', 'shadow');
    expect(t?.runBattles).toBe(1);
    expect(t?.runWins).toBe(1);
    expect(t?.facedBattles).toBe(1);
    // The reporter won the second battle, so the team they faced lost it.
    expect(t?.facedLosses).toBe(1);
    expect(t?.facedWins).toBe(0);
  });

  it('counts a faced complete team toward its cores too', () => {
    const out = teamBoard({ ...WINDOW, rows: [row({ opponents: ['lanturn', 'skarmory', 'shadow'] })] });
    expect(find(out.cores, 'lanturn', 'skarmory')?.facedBattles).toBe(1);
    expect(find(out.cores, 'lanturn', 'skarmory')?.thirds).toEqual([
      { speciesId: 'shadow', sightings: 1 },
    ]);
  });

  it('counts a repeated opponent once', () => {
    const out = teamBoard({ ...WINDOW, rows: [row({ opponents: ['lanturn', 'lanturn'] })] });
    expect(out.cores).toHaveLength(3); // the run team's three, and no core from one species
    expect(out.cores.some((c) => c.species.includes('lanturn'))).toBe(false);
  });
});

describe('teamBoard, the window', () => {
  it('leaves tanked battles out of everything but still reports the devices honestly', () => {
    const out = teamBoard({
      ...WINDOW,
      rows: [
        row({ device: 'd1', tanked: true }),
        row({ device: 'd2', result: 'win' }),
      ],
    });
    expect(out.battles).toBe(1);
    // d1 only ever tanked, so it has shared nothing usable.
    expect(out.devices).toBe(1);
  });

  it('filters by band, and tallies sources over what is left', () => {
    const out = teamBoard({
      ...WINDOW,
      band: 'legend',
      rows: [row({ band: 'ace' }), row({ band: 'legend' })],
    });
    expect(out.battles).toBe(1);
    expect(out.sources).toEqual({ ladder: 1 });
  });

  it('sorts by total battles and caps both lists', () => {
    const rows: BattleRow[] = [];
    for (let i = 0; i < 12; i++) {
      rows.push(row({ team: [`s${i}`, `t${i}`, `u${i}`] }));
    }
    rows.push(row({ team: ['hot', 'hotter', 'hottest'] }));
    rows.push(row({ team: ['hot', 'hotter', 'hottest'] }));
    const out = teamBoard({ ...WINDOW, rows, teamLimit: 3, coreLimit: 4 });
    expect(out.teams).toHaveLength(3);
    expect(out.cores).toHaveLength(4);
    expect(out.teams[0]?.species).toEqual(['hot', 'hotter', 'hottest']);
  });
});
