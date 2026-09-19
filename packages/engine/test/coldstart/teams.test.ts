import { describe, expect, it } from 'vitest';
import { generateColdStartTeams } from '../../src/coldstart/teams.js';
import {
  coldStartBuilds,
  coldStartSpecimens,
  spreadsFromGameMaster,
} from '../../src/coldstart/pool.js';
import { buildOptionsFor } from '../../src/builds/eligibility.js';
import { candidatePool } from '../../src/search/candidates.js';
import { MatrixView } from '../../src/search/matrixView.js';
import { haveStaticData, loadIndex, loadStaticData, readGameMaster } from '../fixtures.js';

const run = haveStaticData() ? describe : describe.skip;

run('generateColdStartTeams', () => {
  function setup(poolSize: number) {
    const data = loadStaticData();
    const index = loadIndex();
    const view = new MatrixView(data.matrix);
    const opts = buildOptionsFor(data.league);
    const builds = coldStartBuilds(
      coldStartSpecimens(
        data.matrix.candidates,
        spreadsFromGameMaster(readGameMaster(), data.league.cp),
        index,
      ),
      index,
      opts,
    );
    const { pool } = candidatePool(builds, data.rankings, view, index, {
      ...opts,
      poolSize,
      excludedSpecimenIds: [],
    });
    return { data, view, pool, types: { types: (id: string) => index.mustSpecies(id).types } };
  }

  it('emits the number of teams asked for, strongest first', () => {
    const { view, pool, types } = setup(40);
    const teams = generateColdStartTeams(pool, view, types, { results: 12 });
    expect(teams).toHaveLength(12);
    for (let i = 1; i < teams.length; i++) {
      expect(teams[i - 1]!.strength).toBeGreaterThanOrEqual(teams[i]!.strength);
    }
    // These are strong teams, not a random trio: the top of a 40-species pool clears 80.
    expect(teams[0]!.strength).toBeGreaterThan(80);
  });

  it('never repeats a species inside a team', () => {
    const { view, pool, types } = setup(40);
    for (const t of generateColdStartTeams(pool, view, types, { results: 12 })) {
      expect(new Set(t.species).size).toBe(3);
    }
  });

  it('keeps the board varied: no two teams share two members', () => {
    const { view, pool, types } = setup(40);
    const teams = generateColdStartTeams(pool, view, types, { results: 12 });
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const shared = teams[i]!.species.filter((s) => teams[j]!.species.includes(s));
        expect(shared.length).toBeLessThan(2);
      }
    }
  });

  it('is deterministic: the same pool gives the same board', () => {
    const { view, pool, types } = setup(40);
    expect(generateColdStartTeams(pool, view, types, { results: 8 })).toEqual(
      generateColdStartTeams(pool, view, types, { results: 8 }),
    );
  });

  it('answers the weights it is given', () => {
    const { data, view, pool, types } = setup(40);
    const flat = generateColdStartTeams(pool, view, types, { results: 8 });
    // Pin every point of facing weight on one opponent; the board must change to answer it.
    const pinned = new Map([[data.matrix.opponents[0] as string, 1]]);
    const skewed = generateColdStartTeams(pool, view, types, { results: 8, weights: pinned });
    expect(skewed[0]!.species).not.toEqual(flat[0]!.species);
  });

  it('finishes fast enough to sit in a bake', () => {
    const { view, pool, types } = setup(60);
    const started = Date.now();
    generateColdStartTeams(pool, view, types, { results: 24 });
    // Measured at roughly 300 ms for 34220 trios over six orderings; ten times that is a failure.
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
