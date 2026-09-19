/**
 * The stable-ranking regression. Seeded synthetic data in, a written-out expected order out.
 *
 * Written out rather than `toMatchSnapshot()` on purpose: a list in the source is read in a diff
 * and an accidental change has to be typed over, where a snapshot is regenerated with `-u` by
 * whoever is trying to get the suite green. Changing either blend is allowed; changing it without
 * noticing is not.
 *
 * The fixture is frozen. It carries its own ranks, curated group, matchup slice, measured species
 * and observed teams, so nothing here reads `apps/meta/public`: a PvPoke bump cannot move these
 * lists, and only a formula change can.
 */
import { describe, expect, it } from 'vitest';
import { MatrixView, type MatchupMatrix } from '@pickthree/engine/meta';
import type { MetaSummaryV1, TeamsV1 } from '../src/api.js';
import type { Baseline, BaselineSpecies } from '../src/baseline.js';
import { rankSpecies } from '../src/rank.js';
import type { GeneratedTeamLite } from '../src/slice.js';
import { TEAM_MIN, UNKNOWN_PRIOR, buildBoard } from '../src/teamRank.js';
import seeded from './fixtures/seeded-great.json';

interface Fixture {
  note: string;
  league: string;
  pvpokeCommit: string;
  pvpokeDate: string;
  ranks: string[];
  baseline: BaselineSpecies[];
  matrix: MatchupMatrix;
  meta: MetaSummaryV1;
  teams: TeamsV1;
  generated: GeneratedTeamLite[];
}

// The JSON widens to its own structural type on import (number[] where the engine wants a
// [number, number] tuple, and so on). The file's shape is pinned by the Fixture interface above
// and by the generator that wrote it, so it is read back through that one cast.
const fixture = seeded as unknown as Fixture;

const baseline: Baseline = {
  league: fixture.league,
  pvpokeCommit: fixture.pvpokeCommit,
  pvpokeDate: fixture.pvpokeDate,
  species: fixture.baseline,
  byId: new Map(fixture.baseline.map((s) => [s.speciesId, s])),
};

function ranking(): ReturnType<typeof rankSpecies> {
  return rankSpecies(fixture.meta, baseline, fixture.ranks);
}

function board(): ReturnType<typeof buildBoard> {
  return buildBoard({
    teams: fixture.teams,
    ranking: ranking(),
    generated: fixture.generated,
    view: new MatrixView(fixture.matrix),
    limit: 20,
  });
}

/** 500 counted battles from 5 devices: min(500/800, 5/10). The devices are the binding side. */
const EXPECTED_SAY = 0.5;

/**
 * The blended order. Note rows 9 and 10: mantine is PvPoke's 11 and melmetal its 9, and mantine
 * is ahead because it was faced 30 times to melmetal's 25. At half the say that is enough to
 * move it one place and not enough to move it five, which is the whole point of the curve.
 */
const EXPECTED_SPECIES = [
  'tinkaton',
  'ninetales_shadow',
  'corsola_galarian',
  'corviknight',
  'cramorant',
  'quagsire_shadow',
  'quagsire',
  'altaria',
  'mantine',
  'melmetal',
];

/**
 * The board, best first. Worth reading rather than skipping, because the top of it is the blend
 * arguing with itself. Recalibrated for PROJECTION_ANCHOR = 100 (a perfect team projects exactly
 * even, not the old 0.70-ish a battle score of 84 used to read as): every projection on this
 * board now sits in the low 0.40s, so the say-weighted gap between a row's own projection and its
 * own measured rate, not the projection's absolute size, decides the order.
 *
 * score = projection + say * (measured - projection), which makes the say-weighted gap read
 * directly off the numbers below:
 *
 * - `ninetales_shadow+tinkaton` takes first with the LOWER measured rate of the top two, 75.6%
 *   against `corviknight+tinkaton`'s 78.3%, because it has far more say: 45 decided battles give
 *   it say 0.60 against corviknight's 23 battles and say 0.43. 0.60 of a 0.352 gap (0.211) beats
 *   0.43 of a 0.380 gap (0.165). More decided battles buys more say, not a better score, and here
 *   it is enough to overturn a real rate disadvantage.
 * - `cramorant+ninetales_shadow` (7th) carries the highest projection on the whole board, 0.416,
 *   on only 8 decided battles. That is under TEAM_MIN, so its 88% record counts for nothing yet
 *   and the row stands on the projection alone, same as before recalibration, just at the new
 *   scale.
 * - `altaria+corviknight+quagsire` (9th) is a generated team with no observed core to nest under,
 *   holding its place against real records on a projection alone (0.399, second highest on the
 *   board).
 *
 * This list is here so that changing it has to be a decision.
 */
const EXPECTED_BOARD = [
  'ninetales_shadow+tinkaton',
  'corviknight+tinkaton',
  'cramorant+tinkaton',
  'corsola_galarian+tinkaton',
  'corsola_galarian+ninetales_shadow',
  'corviknight+ninetales_shadow',
  'cramorant+ninetales_shadow',
  'altaria+ninetales_shadow',
  'altaria+corviknight+quagsire',
  'quagsire_shadow+tinkaton',
];

describe('the seeded ranking', () => {
  it('reports the say the two curves agree on', () => {
    expect(ranking().say).toBeCloseTo(EXPECTED_SAY, 10);
  });

  it('ranks the species in a stable, written-out order', () => {
    expect(
      ranking()
        .rows.slice(0, 10)
        .map((r) => r.speciesId),
    ).toEqual(EXPECTED_SPECIES);
  });

  it('builds a stable, written-out board', () => {
    expect(
      board()
        .rows.slice(0, 10)
        .map((r) => r.species.join('+')),
    ).toEqual(EXPECTED_BOARD);
  });
});

/** The whole board, so these checks do not depend on where the limit happens to fall. */
function wholeBoard(): ReturnType<typeof buildBoard> {
  return buildBoard({
    teams: fixture.teams,
    ranking: ranking(),
    generated: fixture.generated,
    view: new MatrixView(fixture.matrix),
    limit: 500,
  });
}

describe('the seeded data exercises what it is meant to', () => {
  // A fixture that never reaches a branch cannot regress it, so these say out loud which
  // branches the written-out lists above are actually standing over.
  it('carries species PvPoke never ranked, on prior 0', () => {
    const unranked = ranking().rows.filter((r) => r.pvpokeRank === null);
    expect(unranked.length).toBeGreaterThan(0);
    expect(unranked.every((r) => r.sightings > 0)).toBe(true);
  });

  it('carries rows on both sides of TEAM_MIN, so both blend paths are covered', () => {
    const rows = wholeBoard().rows;
    expect(rows.some((r) => r.say === 0 && r.decided > 0)).toBe(true);
    expect(rows.some((r) => r.say > 0)).toBe(true);
    expect(rows.some((r) => r.decided >= TEAM_MIN)).toBe(true);
  });

  it('carries a row outside the slice, blended against UNKNOWN_PRIOR rather than its raw record', () => {
    const outside = wholeBoard().rows.filter((r) => r.outsideSlice.length > 0);
    expect(outside.length).toBeGreaterThan(0);
    for (const row of outside) {
      expect(row.projection).toBeNull();
      expect(row.strength).toBeNull();
      if (row.measured === null) {
        expect(row.score).toBeNull();
        continue;
      }
      // Same formula scoreOf uses: UNKNOWN_PRIOR stands in for the missing projection and is
      // blended by the row's own `say`, exactly like a real one. Recomputed from the row's own
      // `say` and `measured` (documented, hand-derivable fields) rather than a hard-coded number,
      // since this fixture carries many such rows at different sample sizes.
      const expected =
        row.say === 0 ? UNKNOWN_PRIOR : (1 - row.say) * UNKNOWN_PRIOR + row.say * row.measured;
      expect(row.score).toBeCloseTo(expected, 10);
    }
  });

  it('nests complete teams under the cores they were seen with', () => {
    const rows = wholeBoard().rows;
    expect(rows.some((r) => r.kind === 'core' && r.builds.length > 0)).toBe(true);
    expect(rows.some((r) => r.builds.some((x) => x.source === 'generated'))).toBe(true);
  });

  it('projects every core whose pair is in the slice', () => {
    // Note what this fixture says about the fallback prior: at 500 battles every core that makes
    // the top 40 has been seen complete at least once, even with two thirds of the faced rows
    // only partly visible. The never-completed pair is a real shape the worker emits, but it is
    // a rare one, and it is covered directly in teamRank.test.ts rather than here.
    const cores = wholeBoard().rows.filter((r) => r.kind === 'core');
    expect(cores.length).toBeGreaterThan(0);
    for (const core of cores) {
      expect(core.projection === null).toBe(core.outsideSlice.length > 0);
    }
  });

  it('mixes a generated team in among the records rather than listing them apart', () => {
    const top = wholeBoard().rows.slice(0, 10);
    expect(top.some((r) => r.source === 'generated')).toBe(true);
    expect(top.some((r) => r.source === 'observed')).toBe(true);
  });
});
