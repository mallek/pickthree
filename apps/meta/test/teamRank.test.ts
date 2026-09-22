import { describe, expect, it } from 'vitest';
import { MatrixView, expectedWinRate, type MatchupMatrix } from '@pickthree/engine/meta';
import { TEAM_HALF_SAY, TEAM_MIN, UNKNOWN_PRIOR, buildBoard } from '../src/teamRank.js';
import type { SpeciesRanking } from '../src/rank.js';
import type { TeamRowV1, TeamsV1 } from '../src/api.js';
import type { GeneratedTeamLite } from '../src/slice.js';

/**
 * Nine candidates, three opponents. a and b win everything, the rest lose everything.
 *
 * The three opponents are candidates too, exactly as in production: the shipped slice's rows are
 * the top 250 ranked species and PvPoke's meta group is a subset of them, so every opponent has
 * a matrix row. A core's fallback prior averages over the meta group, and it can only do that
 * for members that have a row of their own.
 */
function view(): MatrixView {
  const candidates = ['a', 'b', 'c', 'd', 'e', 'f', 'x', 'y', 'z'];
  const opponents = ['x', 'y', 'z'];
  const scenarios = [
    { shields: [0, 0] as [number, number], energy: [0, 0] as [number, number] },
    { shields: [1, 1] as [number, number], energy: [0, 0] as [number, number] },
    { shields: [2, 2] as [number, number], energy: [0, 0] as [number, number] },
  ];
  const ratings: number[] = [];
  candidates.forEach((id) => {
    opponents.forEach(() => {
      scenarios.forEach(() => {
        ratings.push(id === 'a' || id === 'b' ? 700 : 200);
      });
    });
  });
  const m: MatchupMatrix = {
    league: 'great',
    cp: 1500,
    scenarios,
    candidates,
    opponents,
    candidateMovesets: {},
    opponentMovesets: {},
    ratings,
  };
  return new MatrixView(m);
}

const ranking: SpeciesRanking = {
  say: 0.5,
  battles: 300,
  devices: 5,
  rows: [],
  weights: new Map([
    ['x', 0.5],
    ['y', 0.3],
    ['z', 0.2],
  ]),
  pvpokeCommit: 'abc123',
  pvpokeDate: '2026-09-10',
};

function teamRow(over: Partial<TeamRowV1> & { species: string[] }): TeamRowV1 {
  return {
    kind: over.species.length === 2 ? 'core' : 'team',
    runBattles: 0,
    runWins: 0,
    runLosses: 0,
    facedBattles: 0,
    facedWins: 0,
    facedLosses: 0,
    moves: over.species.map(() => null),
    thirds: [],
    ...over,
  } as TeamRowV1;
}

function teams(over: Partial<TeamsV1> = {}): TeamsV1 {
  return {
    league: 'great',
    since: '2026-09-01T00:00:00.000Z',
    until: '2026-09-30T00:00:00.000Z',
    source: 'all',
    band: 'all',
    battles: 300,
    devices: 5,
    sources: { ladder: 300 },
    teams: [],
    cores: [],
    generatedAt: '2026-09-30T00:00:00.000Z',
    ...over,
  };
}

const GENERATED: GeneratedTeamLite[] = [
  {
    species: ['a', 'b', 'c'],
    strength: 90,
    coverage: 100,
    consistency: 100,
    safety: 100,
    structure: 'ABC',
    exposure: [],
  },
];

describe('buildBoard, cold start', () => {
  it('shows generated teams when nothing has been observed, on their projection alone', () => {
    const b = buildBoard({ teams: teams(), ranking, generated: GENERATED, view: view() });
    expect(b.rows).toHaveLength(1);
    const row = b.rows[0];
    expect(row?.source).toBe('generated');
    expect(row?.kind).toBe('team');
    expect(row?.say).toBe(0);
    expect(row?.decided).toBe(0);
    expect(row?.measured).toBeNull();
    // a and b beat every opponent in every scenario here, so the recomputed trio (a, b, c) scores
    // a perfect 100 (battleScore(100, 100, 100)). PROJECTION_ANCHOR = 100 anchors a perfect team
    // at exactly even, so this is 0.5, not "greater than 0.5": nothing unplayed projects a
    // winning record.
    expect(row?.projection).toBeCloseTo(0.5, 10);
    expect(row?.score).toBe(row?.projection);
  });

  it('recomputes a generated team against the blended weights, not the baked ones', () => {
    // The baked strength is 90; a and b beat everything here, so the recomputed one is 100.
    const b = buildBoard({ teams: teams(), ranking, generated: GENERATED, view: view() });
    expect(b.rows[0]?.strength).toBeGreaterThan(90);
  });

  it('carries the baked strength when the slice could not be loaded, and says so', () => {
    const b = buildBoard({ teams: teams(), ranking, generated: GENERATED, view: null });
    expect(b.projectionless).toBe(true);
    expect(b.rows[0]?.strength).toBe(90);
    expect(b.rows[0]?.order).toBeNull();
  });

  it('names the best order to play a projected team in', () => {
    const b = buildBoard({ teams: teams(), ranking, generated: GENERATED, view: view() });
    expect(b.rows[0]?.order).toHaveLength(3);
    expect([...(b.rows[0]?.order ?? [])].sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('buildBoard, observed rows', () => {
  it('ranks a 5-0 team on its projection alone: it cannot take the top on five battles', () => {
    const hot = teamRow({ species: ['d', 'e', 'f'], runBattles: 5, runWins: 5 });
    const b = buildBoard({
      teams: teams({ teams: [hot] }),
      ranking,
      generated: GENERATED,
      view: view(),
    });
    const row = b.rows.find((r) => r.species.join('+') === 'd+e+f');
    expect(row?.decided).toBe(5);
    expect(row?.measured).toBe(1);
    // Below TEAM_MIN, so the record has no say at all.
    expect(row?.say).toBe(0);
    expect(row?.score).toBe(row?.projection);
    // d, e and f lose everything, so a perfect five battles must not outrank a strong projection.
    expect(b.rows[0]?.source).toBe('generated');
  });

  it('gives the record its first say the moment it clears TEAM_MIN', () => {
    const under = teamRow({
      species: ['d', 'e', 'f'],
      runBattles: TEAM_MIN - 1,
      runWins: TEAM_MIN - 1,
    });
    const over = teamRow({ species: ['d', 'e', 'f'], runBattles: TEAM_MIN, runWins: TEAM_MIN });
    const at = (row: TeamRowV1): number =>
      buildBoard({ teams: teams({ teams: [row] }), ranking, generated: [], view: view() }).rows[0]
        ?.say ?? -1;
    expect(at(under)).toBe(0);
    expect(at(over)).toBeCloseTo(TEAM_MIN / (TEAM_MIN + TEAM_HALF_SAY), 10);
  });

  it('splits the say evenly at 30 decided battles', () => {
    const t = teamRow({ species: ['d', 'e', 'f'], runBattles: 30, runWins: 30 });
    const b = buildBoard({ teams: teams({ teams: [t] }), ranking, generated: [], view: view() });
    const row = b.rows[0];
    expect(row?.say).toBeCloseTo(TEAM_HALF_SAY / (TEAM_HALF_SAY + TEAM_HALF_SAY), 10);
    expect(row?.score).toBeCloseTo(0.5 * (row?.projection ?? 0) + 0.5 * 1, 10);
  });

  it('lets a long record simply win', () => {
    const t = teamRow({ species: ['d', 'e', 'f'], runBattles: 600, runWins: 540, runLosses: 60 });
    const b = buildBoard({
      teams: teams({ teams: [t] }),
      ranking,
      generated: GENERATED,
      view: view(),
    });
    expect(b.rows[0]?.species.join('+')).toBe('d+e+f');
    expect(b.rows[0]?.say).toBeGreaterThan(0.9);
  });

  it('adds run and faced records together for the say, keeping the counts apart', () => {
    const t = teamRow({
      species: ['d', 'e', 'f'],
      runBattles: 10,
      runWins: 8,
      runLosses: 2,
      facedBattles: 10,
      facedWins: 2,
      facedLosses: 8,
    });
    const b = buildBoard({ teams: teams({ teams: [t] }), ranking, generated: [], view: view() });
    const row = b.rows[0];
    expect(row?.runBattles).toBe(10);
    expect(row?.facedBattles).toBe(10);
    expect(row?.decided).toBe(20);
    expect(row?.measured).toBeCloseTo(0.5, 10);
  });

  it('keeps score apart from the record, so a screen cannot print one for the other', () => {
    // The blend is the sort key. With a projection mixed in it is not the win rate any card
    // shows, and the two numbers must not be interchangeable by accident.
    const t = teamRow({ species: ['d', 'e', 'f'], runBattles: 60, runWins: 60 });
    const b = buildBoard({ teams: teams({ teams: [t] }), ranking, generated: [], view: view() });
    const row = b.rows[0];
    expect(row?.measured).toBe(1);
    expect(row?.projection).not.toBeNull();
    expect(row?.score).not.toBe(row?.measured);
    expect(row?.score).toBeLessThan(1);
  });

  it('keeps each moveset with its own Pokemon when the species are re-sorted', () => {
    // `moves` is documented as aligned with `species`, and the row sorts `species` for identity.
    // Sorting the ids alone would put c's moveset under a's sprite. The worker already emits
    // both sorted, so this is a guard on every other caller.
    const moves = [
      { fast: 'C_FAST', charged: ['C_ONE'], battles: 30 },
      { fast: 'A_FAST', charged: ['A_ONE'], battles: 20 },
      null,
    ];
    const t = teamRow({
      species: ['c', 'a', 'b'],
      moves,
      facedBattles: 10,
      facedWins: 5,
      facedLosses: 5,
    });
    const b = buildBoard({ teams: teams({ teams: [t] }), ranking, generated: [], view: view() });
    const row = b.rows[0];
    expect(row?.species).toEqual(['a', 'b', 'c']);
    expect(row?.moves.map((m) => m?.fast ?? null)).toEqual(['A_FAST', null, 'C_FAST']);
  });

  it('holds a row with sightings but no decided battle to its projection alone', () => {
    const t = teamRow({ species: ['a', 'b', 'c'], facedBattles: 12 });
    const b = buildBoard({ teams: teams({ teams: [t] }), ranking, generated: [], view: view() });
    const row = b.rows[0];
    expect(row?.decided).toBe(0);
    expect(row?.measured).toBeNull();
    expect(row?.say).toBe(0);
    expect(row?.score).toBe(row?.projection);
  });
});

describe('buildBoard, cores', () => {
  it('projects a core by averaging over the third members it was actually seen with', () => {
    const core = teamRow({
      species: ['a', 'b'],
      facedBattles: 20,
      facedWins: 10,
      facedLosses: 10,
      thirds: [
        { speciesId: 'c', sightings: 15 },
        { speciesId: 'd', sightings: 5 },
      ],
    });
    const b = buildBoard({ teams: teams({ cores: [core] }), ranking, generated: [], view: view() });
    const row = b.rows.find((r) => r.kind === 'core');
    expect(row?.projection).not.toBeNull();
    // a + b carry the team whatever the third is, so the average sits high but under a perfect
    // complete team: the point of the averaging.
    expect(row?.strength).toBeGreaterThan(50);
  });

  it('weights each third by how often it actually completed the pair', () => {
    // d drags the pair down and c does not, so a core mostly seen with d must project below one
    // mostly seen with c.
    const pair = ['d', 'e'];
    const withGood = teamRow({
      species: pair,
      thirds: [
        { speciesId: 'a', sightings: 19 },
        { speciesId: 'f', sightings: 1 },
      ],
    });
    const withBad = teamRow({
      species: pair,
      thirds: [
        { speciesId: 'a', sightings: 1 },
        { speciesId: 'f', sightings: 19 },
      ],
    });
    const strengthOf = (row: TeamRowV1): number | null =>
      buildBoard({ teams: teams({ cores: [row] }), ranking, generated: [], view: view() }).rows[0]
        ?.strength ?? null;
    expect(strengthOf(withGood) ?? 0).toBeGreaterThan(strengthOf(withBad) ?? 0);
  });

  it("falls back to PvPoke's group, weighted, for a pair never seen complete", () => {
    const core = teamRow({ species: ['a', 'b'], facedBattles: 4, facedWins: 2, facedLosses: 2 });
    const b = buildBoard({ teams: teams({ cores: [core] }), ranking, generated: [], view: view() });
    // Every opponent has a matrix row in this fixture, so there is always something to average.
    expect(b.rows[0]?.projection).not.toBeNull();
  });

  it('never averages a pair against itself: a team cannot field the same Pokemon twice', () => {
    // PvPoke's meta group contains the core's own members, so the fallback walks over them. The
    // honest average is over the thirds a player could actually bring.
    //
    // The fixture has to make the illegal trio score DIFFERENTLY, or the test cannot fail. z is
    // the only member that beats opponent z, so it is the only third that completes coverage:
    //
    //   [x,y,z]  coverage 100, consistency 100, safety 100 - 20 (x hard-loses z as the switch)
    //            = battleScore(100, 100, 80) = 95
    //   [x,y,x]  z uncovered, so coverage (0.5 + 0.3) / 1.0 = 80, consistency 100,
    //            safety 100 - 20 - 10 (one of the top uncovered)
    //            = battleScore(80, 100, 70) = 82.5
    //   [x,y,y]  the same three numbers, 82.5
    //
    // So the skip gives 95, and averaging the duplicates in would give
    // 0.5 * 82.5 + 0.3 * 82.5 + 0.2 * 95 = 85.
    const beats: Record<string, string[]> = { x: ['x', 'y'], y: [], z: ['z'] };
    const ids = ['x', 'y', 'z'];
    const pairIsMeta = new MatrixView({
      league: 'great',
      cp: 1500,
      scenarios: [
        { shields: [0, 0], energy: [0, 0] },
        { shields: [1, 1], energy: [0, 0] },
        { shields: [2, 2], energy: [0, 0] },
      ],
      candidates: ids,
      opponents: ids,
      ratings: ids.flatMap((c) =>
        ids.flatMap((o) => {
          const v = beats[c]?.includes(o) === true ? 700 : 200;
          return [v, v, v];
        }),
      ),
      candidateMovesets: {},
      opponentMovesets: {},
    });
    const LEGAL_ONLY = 95;
    const WITH_DUPLICATES = 85;
    const core = teamRow({ species: ['x', 'y'] });
    const board = buildBoard({
      teams: teams({ cores: [core] }),
      ranking,
      generated: [],
      view: pairIsMeta,
    });
    // Only z is left to average over, so the core's strength is exactly the strength of x+y+z.
    const trio = teamRow({ species: ['x', 'y', 'z'] });
    const whole = buildBoard({
      teams: teams({ teams: [trio] }),
      ranking,
      generated: [],
      view: pairIsMeta,
    });
    expect(whole.rows[0]?.strength).toBe(LEGAL_ONLY);
    expect(board.rows[0]?.strength).toBe(LEGAL_ONLY);
    expect(board.rows[0]?.strength).toBe(whole.rows[0]?.strength);
    // The number the bug produced. Naming it is the point: without this line the assertions
    // above pass whether or not the duplicates were skipped.
    expect(board.rows[0]?.strength).not.toBe(WITH_DUPLICATES);
  });

  it('has no projection for a pair never seen complete when the meta group has no rows', () => {
    // The honest answer when the fallback has nothing to average over: nothing, not a zero.
    const narrow = new MatrixView({
      league: 'great',
      cp: 1500,
      scenarios: [
        { shields: [0, 0], energy: [0, 0] },
        { shields: [1, 1], energy: [0, 0] },
        { shields: [2, 2], energy: [0, 0] },
      ],
      candidates: ['a', 'b'],
      opponents: ['x', 'y', 'z'],
      candidateMovesets: {},
      opponentMovesets: {},
      ratings: new Array(2 * 3 * 3).fill(700),
    });
    const core = teamRow({ species: ['a', 'b'], facedBattles: 4, facedWins: 2, facedLosses: 2 });
    const b = buildBoard({ teams: teams({ cores: [core] }), ranking, generated: [], view: narrow });
    expect(b.rows[0]?.projection).toBeNull();
    // 4 decided battles is under TEAM_MIN (15), so say is 0 and the 50% record has no say at
    // all: the row stands on UNKNOWN_PRIOR alone, exactly as a real projection would at this
    // sample size.
    expect(b.rows[0]?.score).toBeCloseTo(UNKNOWN_PRIOR, 10);
  });

  it('nests a complete team under every core it was seen with', () => {
    const core1 = teamRow({ species: ['a', 'b'], facedBattles: 10, facedWins: 6, facedLosses: 4 });
    const core2 = teamRow({ species: ['a', 'c'], facedBattles: 10, facedWins: 6, facedLosses: 4 });
    const team = teamRow({
      species: ['a', 'b', 'c'],
      facedBattles: 10,
      facedWins: 6,
      facedLosses: 4,
    });
    const b = buildBoard({
      teams: teams({ cores: [core1, core2], teams: [team] }),
      ranking,
      generated: [],
      view: view(),
    });
    for (const row of b.rows.filter((r) => r.kind === 'core')) {
      expect(row.builds.map((x) => x.species.join('+'))).toContain('a+b+c');
    }
    // The complete team is nested, not repeated at the top level.
    expect(b.rows.filter((r) => r.kind === 'team' && r.source === 'observed')).toHaveLength(0);
  });

  it('nests a generated team under an observed core it matches, rather than repeating it', () => {
    const core = teamRow({ species: ['a', 'b'], facedBattles: 10, facedWins: 5, facedLosses: 5 });
    const b = buildBoard({
      teams: teams({ cores: [core] }),
      ranking,
      generated: GENERATED,
      view: view(),
    });
    expect(b.rows).toHaveLength(1);
    expect(b.rows[0]?.kind).toBe('core');
    expect(b.rows[0]?.builds.map((x) => x.source)).toContain('generated');
  });

  // I2: the generated teams are the strongest projections drawn from the same pool the teams
  // people actually run come from, so a generated trio matching an observed one is likely rather
  // than exotic. Two rows for one team would say opposite things about it ("not yet seen in
  // shared battles" beside a record) and collide on the `species.join('+')` key Teams.tsx gives
  // every row, which React logs and meta:screens fails the build on.
  it('drops a generated team that has already been observed, leaving one row for it', () => {
    const t = teamRow({ species: ['a', 'b', 'c'], runBattles: 20, runWins: 12, runLosses: 8 });
    const b = buildBoard({
      teams: teams({ teams: [t] }),
      ranking,
      generated: GENERATED,
      view: view(),
    });
    expect(b.rows).toHaveLength(1);
    expect(b.rows[0]?.source).toBe('observed');
    expect(b.rows[0]?.runBattles).toBe(20);
    const keys = b.rows.map((r) => r.species.join('+'));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('matches an observed team for the dedupe whatever order its species arrived in', () => {
    const t = teamRow({ species: ['c', 'a', 'b'], runBattles: 20, runWins: 12, runLosses: 8 });
    const b = buildBoard({
      teams: teams({ teams: [t] }),
      ranking,
      generated: GENERATED,
      view: view(),
    });
    expect(b.rows).toHaveLength(1);
    expect(b.rows[0]?.source).toBe('observed');
  });

  it('leaves a complete team at the top level when none of its pairs is a core on the board', () => {
    const core = teamRow({ species: ['d', 'e'], facedBattles: 10, facedWins: 5, facedLosses: 5 });
    const b = buildBoard({
      teams: teams({ cores: [core] }),
      ranking,
      generated: GENERATED,
      view: view(),
    });
    // The board must not assert that a pair is played together when nobody has played it.
    expect(b.rows.map((r) => r.species.join('+')).sort()).toEqual(['a+b+c', 'd+e']);
  });
});

describe('buildBoard, outside the slice', () => {
  it('gives no projection at all when any member has no matrix row', () => {
    const t = teamRow({
      species: ['a', 'b', 'stranger'],
      facedBattles: 40,
      facedWins: 30,
      facedLosses: 10,
    });
    const b = buildBoard({ teams: teams({ teams: [t] }), ranking, generated: [], view: view() });
    const row = b.rows[0];
    expect(row?.projection).toBeNull();
    expect(row?.strength).toBeNull();
    expect(row?.outsideSlice).toEqual(['stranger']);
    // It does NOT rank on its raw measured record: with 40 decided battles (>= TEAM_MIN), say is
    // 40 / (40 + 30) = 4/7, and the missing projection is replaced with UNKNOWN_PRIOR (0.25)
    // rather than skipped, so the row is blended exactly like a projected one:
    //   (1 - 4/7) * 0.25 + (4/7) * 0.75 = 3/7 * 0.25 + 4/7 * 0.75 = 0.75/7 + 3/7 = 3.75/7
    expect(row?.score).toBeCloseTo(3.75 / 7, 10);
  });

  it('gives a core no projection when one of the pair is outside the slice', () => {
    const core = teamRow({
      species: ['a', 'stranger'],
      facedBattles: 40,
      facedWins: 30,
      facedLosses: 10,
      thirds: [{ speciesId: 'b', sightings: 40 }],
    });
    const b = buildBoard({ teams: teams({ cores: [core] }), ranking, generated: [], view: view() });
    expect(b.rows[0]?.projection).toBeNull();
    expect(b.rows[0]?.outsideSlice).toEqual(['stranger']);
    // Same arithmetic as the team case above: 40 decided battles, say = 4/7, blended against
    // UNKNOWN_PRIOR (0.25) rather than the raw 0.75 record: 3.75 / 7.
    expect(b.rows[0]?.score).toBeCloseTo(3.75 / 7, 10);
  });

  it('keeps a generated row on its baked strength when a member has no row, and names it', () => {
    // The baked number is a real projection of that exact team from the same PvPoke commit; the
    // reweigh is what could not run. The row keeps it, and outsideSlice says why it is the baked
    // one. A screen asks projection === null for "no projection", never outsideSlice.length.
    const stray: GeneratedTeamLite[] = [
      { ...(GENERATED[0] as GeneratedTeamLite), species: ['a', 'b', 'stranger'] },
    ];
    const b = buildBoard({ teams: teams(), ranking, generated: stray, view: view() });
    expect(b.rows[0]?.strength).toBe(90);
    expect(b.rows[0]?.projection).not.toBeNull();
    expect(b.rows[0]?.outsideSlice).toEqual(['stranger']);
  });

  it('has no score at all with neither a projection nor a decided battle, and sorts last', () => {
    const scored = teamRow({ species: ['a', 'b', 'c'], facedBattles: 3, facedWins: 3 });
    const blank = teamRow({
      species: ['a', 'b', 'stranger'],
      facedBattles: 2,
      facedWins: 0,
      facedLosses: 0,
    });
    const b = buildBoard({
      teams: teams({ teams: [scored, blank] }),
      ranking,
      generated: [],
      view: view(),
    });
    expect(b.rows[b.rows.length - 1]?.score).toBeNull();
    expect(b.rows[b.rows.length - 1]?.species.join('+')).toBe('a+b+stranger');
  });

  it('reports how much of the facing weight a projection could speak for', () => {
    const withOutsider: SpeciesRanking = {
      ...ranking,
      weights: new Map([
        ['x', 0.25],
        ['y', 0.25],
        ['outsider', 0.5],
      ]),
    };
    const b = buildBoard({
      teams: teams(),
      ranking: withOutsider,
      generated: GENERATED,
      view: view(),
    });
    expect(b.rows[0]?.weightCovered).toBeCloseTo(0.5, 10);
    // Task 12 fix round 1, item 6: the same figure is a board-wide fact too, not just something
    // reconstructed by reading it off a row that might not exist. `metaGroupSize` comes from the
    // same StrengthContext as `weightCovered`, so a screen reading both off `Board` cannot let
    // them drift out of step the way reading one off a row and the other off `ranking.rows` did.
    expect(b.weightCovered).toBeCloseTo(0.5, 10);
    expect(b.metaGroupSize).toBe(3);
  });

  it('ranks every row on its record when the slice is missing entirely', () => {
    const good = teamRow({ species: ['d', 'e', 'f'], runBattles: 100, runWins: 80, runLosses: 20 });
    const poor = teamRow({ species: ['a', 'b', 'c'], runBattles: 100, runWins: 20, runLosses: 80 });
    const b = buildBoard({
      teams: teams({ teams: [good, poor] }),
      ranking,
      generated: [],
      view: null,
    });
    expect(b.projectionless).toBe(true);
    expect(b.rows.map((r) => r.species.join('+'))).toEqual(['d+e+f', 'a+b+c']);
    expect(b.rows.every((r) => r.projection === null)).toBe(true);
    // With no slice at all, every row's missing projection is replaced with UNKNOWN_PRIOR (0.25)
    // and blended exactly like a real one, rather than falling back to the raw record. 100
    // decided battles gives say = 100 / (100 + 30) = 10/13:
    //   (1 - 10/13) * 0.25 + (10/13) * 0.8 = 3/13 * 0.25 + 10/13 * 0.8 = 0.75/13 + 8/13 = 8.75/13
    // The ordering is unaffected (0.673 still beats the poor row's 2.75/13 = 0.212), so "ranks
    // every row on its record" still holds relatively, even though score is no longer the raw
    // record itself.
    expect(b.rows[0]?.score).toBeCloseTo(8.75 / 13, 10);
    // No slice, nothing to cover: both board-wide facts read as "none", matching `projectionless`
    // rather than a stale or defaulted-to-full figure a screen might otherwise show as if the
    // meta group had been fully accounted for.
    expect(b.weightCovered).toBe(0);
    expect(b.metaGroupSize).toBe(0);
  });
});

describe('buildBoard, the shape of the board', () => {
  it('holds the board to its limit', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      teamRow({ species: ['a', 'b', `filler${i}`], facedBattles: 40, facedWins: 40 - i }),
    );
    const b = buildBoard({
      teams: teams({ teams: many }),
      ranking,
      generated: [],
      view: view(),
      limit: 3,
    });
    expect(b.rows).toHaveLength(3);
  });

  it("sorts a core's builds best first", () => {
    const core = teamRow({ species: ['a', 'b'], facedBattles: 10, facedWins: 5, facedLosses: 5 });
    const weak = teamRow({
      species: ['a', 'b', 'd'],
      facedBattles: 60,
      facedWins: 6,
      facedLosses: 54,
    });
    const strong = teamRow({
      species: ['a', 'b', 'c'],
      facedBattles: 60,
      facedWins: 54,
      facedLosses: 6,
    });
    const b = buildBoard({
      teams: teams({ cores: [core], teams: [weak, strong] }),
      ranking,
      generated: [],
      view: view(),
    });
    expect(b.rows[0]?.builds.map((x) => x.species.join('+'))).toEqual(['a+b+c', 'a+b+d']);
  });

  it('says nothing is projected when there is nothing at all to say', () => {
    const b = buildBoard({ teams: teams(), ranking, generated: [], view: view() });
    expect(b.rows).toEqual([]);
    expect(b.projectionless).toBe(false);
  });

  it('turns a projection into a 0 to 1 number with the one calibration, not its own', () => {
    const b = buildBoard({ teams: teams(), ranking, generated: GENERATED, view: view() });
    expect(b.rows[0]?.projection).toBeCloseTo(expectedWinRate(b.rows[0]?.strength ?? 0), 10);
  });

  // Fix round 1, item 4: two unprojectable rows both score exactly UNKNOWN_PRIOR (say is 0 below
  // TEAM_MIN, so the measured side never enters the blend), a tie the species name used to break
  // first. Total battles has to win instead, or a row seen ten times can sit under one seen once
  // for no reason but its name.
  it('breaks an equal non-null score tie by total battles before the species name', () => {
    const lowBattles = teamRow({
      species: ['aaa', 'bbb', 'stranger'],
      facedBattles: 1,
      facedWins: 1,
    });
    const highBattles = teamRow({
      species: ['zzz', 'yyy', 'other'],
      runBattles: 10,
      runWins: 5,
      runLosses: 5,
    });
    const b = buildBoard({
      teams: teams({ teams: [lowBattles, highBattles] }),
      ranking,
      generated: [],
      view: view(),
    });
    expect(b.rows[0]?.score).toBeCloseTo(UNKNOWN_PRIOR, 10);
    expect(b.rows[1]?.score).toBeCloseTo(UNKNOWN_PRIOR, 10);
    // 'aaa+bbb+stranger' sorts alphabetically before 'other+yyy+zzz', so the old tiebreak would
    // have put the ONE-battle row first. The TEN-battle row must win instead.
    expect(b.rows.map((r) => r.species.join('+'))).toEqual(['other+yyy+zzz', 'aaa+bbb+stranger']);
  });
});
