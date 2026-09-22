import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  GameDataIndex,
  buildOptionsFor,
  type League as EngineLeague,
  type Move,
  type Rankings,
  type RankingEntry,
  type Species,
} from '@pickthree/engine';
import { facingWeight, MatrixView, type MatchupMatrix } from '@pickthree/engine/meta';
import {
  bake,
  generateFor,
  legalFor,
  OPEN_EQUIVALENT_CUP,
  priorWeights,
  ranksOf,
  readEpochs,
  siteLeagues,
  sliceMatrix,
} from '../scripts/bake.js';

const input = {
  pokemon: [
    { speciesId: 'azumarill', speciesName: 'Azumarill', dex: 184, types: ['water', 'fairy'] },
    {
      speciesId: 'corsola_galarian',
      speciesName: 'Corsola (Galarian)',
      dex: 222,
      types: ['ghost', 'none'],
    },
  ],
  moves: [
    { moveId: 'BUBBLE', name: 'Bubble', type: 'water' },
    { moveId: 'ICE_BEAM', name: 'Ice Beam', type: 'ice' },
  ],
  leagues: [{ id: 'great', meta: 'great', kind: 'standard' }],
  metaGroups: {
    great: [
      { speciesId: 'azumarill', fastMove: 'BUBBLE', chargedMoves: ['ICE_BEAM', 'PLAY_ROUGH'] },
    ],
  },
  rankings: {
    great: [
      {
        speciesId: 'azumarill',
        score: 88,
        rating: 671,
        fastMoves: [
          { moveId: 'BUBBLE', uses: 100 },
          { moveId: 'ROCK_SMASH', uses: 20 },
        ],
        chargedMoves: [
          { moveId: 'ICE_BEAM', uses: 90 },
          { moveId: 'PLAY_ROUGH', uses: 80 },
          { moveId: 'HYDRO_PUMP', uses: 70 },
          { moveId: 'A', uses: 6 },
          { moveId: 'B', uses: 5 },
        ],
      },
    ],
  },
  manifest: { pvpokeCommit: 'abc1234', pvpokeDate: '2026-09-10' },
};

describe('bake', () => {
  it('shrinks the species list to name, dex and types, dropping the "none" filler type', () => {
    const { species } = bake(input);
    expect(species['azumarill']).toEqual(['Azumarill', 184, 'water,fairy']);
    expect(species['corsola_galarian']).toEqual(['Corsola (Galarian)', 222, 'ghost']);
  });

  it('shrinks moves to name and type', () => {
    expect(bake(input).moves['ICE_BEAM']).toEqual(['Ice Beam', 'ice']);
  });

  it('builds a baseline from the curated group, stamped with the pinned commit', () => {
    const b = bake(input).baselines['great']!;
    expect(b).toMatchObject({
      league: 'great',
      source: 'pvpoke',
      pvpokeCommit: 'abc1234',
      pvpokeDate: '2026-09-10',
    });
    expect(b.species[0]).toMatchObject({
      speciesId: 'azumarill',
      score: 88,
      rating: 671,
      fastMove: 'BUBBLE',
      chargedMoves: ['ICE_BEAM', 'PLAY_ROUGH'],
    });
  });

  it('keeps at most four moves per slot, most used first', () => {
    const b = bake(input).baselines['great']!;
    expect(b.species[0]!.chargedUsage.map((m) => m.moveId)).toEqual([
      'ICE_BEAM',
      'PLAY_ROUGH',
      'HYDRO_PUMP',
      'A',
    ]);
    expect(b.species[0]!.fastUsage).toHaveLength(2);
  });

  it('orders the baseline by PvPoke score, best first, unranked last', () => {
    const two = {
      ...input,
      metaGroups: {
        great: [
          { speciesId: 'corsola_galarian', fastMove: 'ASTONISH', chargedMoves: ['NIGHT_SHADE'] },
          ...input.metaGroups.great,
        ],
      },
    };
    const baked = bake(two).baselines['great']!;
    expect(baked.species.map((s) => s.speciesId)).toEqual(['azumarill', 'corsola_galarian']);
    expect(baked.species[1]!.score).toBeNull();
  });
});

describe('readEpochs', () => {
  it('accepts a minimal entry and sorts by time', () => {
    const out = readEpochs([
      { at: '2026-10-14T00:00:00Z', note: 'move rebalance', leagues: ['great'] },
      { at: '2026-09-08T13:00:00-07:00', note: 'Season 28' },
    ]);
    expect(out.map((e) => e.note)).toEqual(['Season 28', 'move rebalance']);
    expect(out[0]?.leagues).toBeUndefined();
    expect(out[1]?.leagues).toEqual(['great']);
  });

  it('refuses an entry that is not a time and a note', () => {
    expect(() => readEpochs([{ at: 'soon', note: 'x' }])).toThrow(/at/);
    expect(() => readEpochs([{ at: '2026-09-08T13:00:00-07:00' }])).toThrow(/note/);
    expect(() => readEpochs('nope')).toThrow(/array/);
  });
});

describe('sliceMatrix', () => {
  const matrix: MatchupMatrix = {
    league: 'great',
    cp: 1500,
    scenarios: [
      { shields: [0, 0], energy: [0, 0] },
      { shields: [1, 1], energy: [0, 0] },
      { shields: [2, 2], energy: [0, 0] },
    ],
    candidates: ['a', 'b', 'c'],
    opponents: ['x', 'y'],
    candidateMovesets: { a: ['F'], b: ['F'], c: ['F'] },
    opponentMovesets: { x: ['F'], y: ['F'] },
    // a: 1..6, b: 7..12, c: 13..18
    ratings: Array.from({ length: 18 }, (_, i) => i + 1),
  };

  it('keeps the first N rows and every rating in them, unchanged', () => {
    const out = sliceMatrix(matrix, 2);
    expect(out.candidates).toEqual(['a', 'b']);
    expect(out.opponents).toEqual(['x', 'y']);
    expect(out.ratings).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(Object.keys(out.candidateMovesets).sort()).toEqual(['a', 'b']);
  });

  it('is a no-op when the matrix is already smaller than the cut', () => {
    expect(sliceMatrix(matrix, 99).candidates).toEqual(['a', 'b', 'c']);
  });
});

describe('ranksOf', () => {
  it('is PvPoke overall order, first entry wins a duplicate', () => {
    expect(ranksOf([{ speciesId: 'a' }, { speciesId: 'b' }, { speciesId: 'a' }])).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('priorWeights', () => {
  it('weights by facingWeight of PvPoke overall rank, normalised to sum to 1', () => {
    const overall = [{ speciesId: 'a' }, { speciesId: 'b' }, { speciesId: 'c' }];
    const weights = priorWeights(overall, ['c', 'a']);
    const rawA = facingWeight(1);
    const rawC = facingWeight(3);
    const total = rawA + rawC;
    expect(weights.get('a')).toBeCloseTo(rawA / total);
    expect(weights.get('c')).toBeCloseTo(rawC / total);
    const sum = [...weights.values()].reduce((x, y) => x + y, 0);
    expect(sum).toBeCloseTo(1);
  });

  it('treats an opponent PvPoke never ranked as rank 64, the same floor facingWeight uses', () => {
    const overall = [{ speciesId: 'a' }];
    const weights = priorWeights(overall, ['a', 'ghost']);
    const total = facingWeight(1) + facingWeight(null);
    expect(weights.get('ghost')).toBeCloseTo(facingWeight(null) / total);
  });
});

describe('legalFor', () => {
  it('names the open-equivalent cup only for Great League', () => {
    expect(OPEN_EQUIVALENT_CUP).toEqual({ great: 'championshipseries' });
  });

  it('lists every ranked species the cup drops, in the league ranking order', () => {
    const leagueRanks = [
      { speciesId: 'azumarill' },
      { speciesId: 'mimikyu' },
      { speciesId: 'venusaur_mega' },
      { speciesId: 'medicham' },
    ];
    const cupRanks = [{ speciesId: 'azumarill' }, { speciesId: 'medicham' }];
    expect(legalFor('great', leagueRanks, cupRanks)).toEqual({
      cup: 'championshipseries',
      banned: ['mimikyu', 'venusaur_mega'],
    });
  });

  it('gives a league with no Play! format an empty list and no cup', () => {
    expect(legalFor('ultra', [{ speciesId: 'giratina_altered' }], null)).toEqual({
      cup: null,
      banned: [],
    });
  });

  it('de-duplicates a league ranking that lists a species twice', () => {
    const leagueRanks = [
      { speciesId: 'mimikyu' },
      { speciesId: 'mimikyu' },
      { speciesId: 'azumarill' },
    ];
    expect(legalFor('great', leagueRanks, [{ speciesId: 'azumarill' }]).banned).toEqual([
      'mimikyu',
    ]);
  });
});

describe('siteLeagues', () => {
  it('keeps the open leagues and drops the app-only cup leagues', () => {
    const leagues = [
      { id: 'great', meta: 'great', kind: 'standard' },
      { id: 'ultra', meta: 'ultra', kind: 'standard' },
      { id: 'championshipseries', meta: 'great', kind: 'cup' },
      { id: 'remix', meta: 'remix', kind: 'special' },
    ];
    expect(siteLeagues(leagues).map((l) => l.id)).toEqual(['great', 'ultra']);
  });
});

describe('bake, over a league list carrying a cup league', () => {
  it('builds a baseline for the site leagues only', () => {
    const baked = bake({
      ...input,
      leagues: [
        { id: 'great', meta: 'great', kind: 'standard' },
        { id: 'championshipseries', meta: 'great', kind: 'cup' },
      ],
    });
    expect(Object.keys(baked.baselines)).toEqual(['great']);
  });
});

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(here, '..', '..', 'web', 'public', 'data');
const haveStaticData = fs.existsSync(path.join(DATA_DIR, 'data-manifest.json'));
const run = haveStaticData ? describe : describe.skip;

run('generateFor over the real Great League data', () => {
  function load() {
    const readJson = <T>(...parts: string[]): T =>
      JSON.parse(fs.readFileSync(path.join(DATA_DIR, ...parts), 'utf8')) as T;
    const index = new GameDataIndex(
      readJson<Species[]>('pokemon.json'),
      readJson<Move[]>('moves.json'),
    );
    const league = readJson<EngineLeague[]>('leagues.json').find((l) => l.id === 'great');
    if (!league) {
      throw new Error('great league missing from leagues.json');
    }
    const matrix = readJson<MatchupMatrix>('matrix', 'great.json');
    const rankings: Rankings = {
      overall: readJson<RankingEntry[]>('rankings', 'great', 'overall.json'),
      leads: readJson<RankingEntry[]>('rankings', 'great', 'leads.json'),
      switches: readJson<RankingEntry[]>('rankings', 'great', 'switches.json'),
      closers: readJson<RankingEntry[]>('rankings', 'great', 'closers.json'),
      chargers: readJson<RankingEntry[]>('rankings', 'great', 'chargers.json'),
    };
    const gameMaster: unknown = readJson('gamemaster.json');
    return { index, league, matrix, rankings, gameMaster };
  }

  it('varies safety scores once weighted by PvPoke rank instead of matrix column order', () => {
    const { index, league, matrix, rankings, gameMaster } = load();
    const view = new MatrixView(matrix);
    buildOptionsFor(league); // sanity: the real league record builds valid options
    const teams = generateFor({ league, index, matrix, rankings, gameMaster });
    expect(teams.length).toBeGreaterThan(0);
    const safeties = new Set(teams.map((t) => t.safety));
    expect(safeties.size).toBeGreaterThan(1);
    expect(view.opponents.length).toBeGreaterThan(0);
    // Drafting 60-species pool trios (about 34000 trios, six orderings each) is roughly 300ms
    // alone; under the full suite's parallel workers it can run much slower than the default
    // 5000ms budget, the same margin teams.test.ts gives the identical work in the engine.
  }, 20000);
});
