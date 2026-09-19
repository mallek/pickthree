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
import { TEAM_MIN, buildBoard } from '../src/teamRank.js';
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
 * The board, best first. Worth reading rather than skipping: `ninetales_shadow+tinkaton` has the
 * larger record of the top two, 45 decided battles at 76%, and still sits second, because
 * `corviknight+tinkaton` has both a hair more projection and a better rate over 23; and
 * `cramorant+ninetales_shadow` is third on the highest projection on the board with only 8
 * decided battles, under TEAM_MIN, so its 88% counts for nothing yet. Row 6 is a generated team
 * with no observed core to nest under, holding its place against real records on a projection
 * alone. That is the blend, and this list is here so that changing it has to be a decision.
 */
const EXPECTED_BOARD = [
  'corviknight+tinkaton',
  'ninetales_shadow+tinkaton',
  'cramorant+ninetales_shadow',
  'cramorant+tinkaton',
  'altaria+ninetales_shadow',
  'altaria+corviknight+quagsire',
  'quagsire_shadow+tinkaton',
  'altaria+tinkaton',
  'mantine+ninetales_shadow',
  'quagsire+tinkaton',
];

describe('the seeded ranking', () => {
  it('reports the say the two curves agree on', () => {
    expect(ranking().say).toBeCloseTo(EXPECTED_SAY, 10);
  });

  it('ranks the species in a stable, written-out order', () => {
    expect(ranking().rows.slice(0, 10).map((r) => r.speciesId)).toEqual(EXPECTED_SPECIES);
  });

  it('builds a stable, written-out board', () => {
    expect(board().rows.slice(0, 10).map((r) => r.species.join('+'))).toEqual(EXPECTED_BOARD);
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

  it('carries a row outside the slice, which ranks on its record alone', () => {
    const outside = wholeBoard().rows.filter((r) => r.outsideSlice.length > 0);
    expect(outside.length).toBeGreaterThan(0);
    for (const row of outside) {
      expect(row.projection).toBeNull();
      expect(row.strength).toBeNull();
      expect(row.score).toBe(row.measured);
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
