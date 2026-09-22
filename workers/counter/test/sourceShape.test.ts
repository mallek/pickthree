import { describe, expect, it } from 'vitest';
import type { BattleRow } from '../src/battles.js';
import { summarize } from '../src/meta.js';
import { teamBoard } from '../src/teams.js';

const NOW = new Date('2026-09-18T12:00:00.000Z');
const WINDOW = { since: '2026-09-11T00:00:00.000Z', until: '2026-09-18T00:00:00.000Z' };

function row(over: Partial<BattleRow> = {}): BattleRow {
  return {
    device: 'd1',
    league: 'great',
    season: 28,
    at: '2026-09-17T10:00:00.000Z',
    team: ['tinkaton', 'azumarill', 'clodsire'],
    moves: null,
    opponents: ['medicham', 'lanturn'],
    result: 'win',
    tanked: false,
    band: 'ace',
    source: 'ladder',
    ...over,
  };
}

const ROWS = [row(), row({ device: 'd2', band: 'legend', result: 'loss' }), row({ tanked: true })];

/**
 * `source=ladder` has to be the response `band=all` used to give. Everything but the echoed
 * request parameters is compared: those two fields are the only thing this change can
 * legitimately move, and comparing them would only assert the change against itself. This file
 * outlives phase 1: Task 13 drops `band` from the response and this test then destructures one
 * field instead of two, with every other expectation untouched. That is the point of it.
 */
describe('source=ladder is the old band=all response', () => {
  it('differs from a fixed expectation in nothing but the echoed parameters', () => {
    const { source, band, ...rest } = summarize({
      league: 'great',
      ...WINDOW,
      source: 'ladder',
      rows: ROWS,
      previousRows: null,
      now: NOW,
    });
    expect(source).toBe('ladder');
    expect(band).toBe('all');
    expect(rest).toEqual({
      league: 'great',
      ...WINDOW,
      battles: 2,
      tanked: 1,
      devices: 2,
      bands: { ace: 1, legend: 1 },
      sources: { ladder: 2 },
      species: rest.species,
      teams: rest.teams,
      previous: null,
      generatedAt: NOW.toISOString(),
    });
    expect(rest.species.find((s) => s.speciesId === 'medicham')).toEqual({
      speciesId: 'medicham',
      sightings: 2,
      wins: 1,
      losses: 1,
      runs: 0,
      runWins: 0,
      runLosses: 0,
    });
  });

  it('gives the team board the same shape whichever source asked', () => {
    const ladder = teamBoard({ league: 'great', ...WINDOW, source: 'ladder', rows: ROWS, now: NOW });
    const all = teamBoard({ league: 'great', ...WINDOW, source: 'all', rows: ROWS, now: NOW });
    expect(Object.keys(ladder).sort()).toEqual(Object.keys(all).sort());
    expect(ladder.teams).toEqual(all.teams);
    expect(ladder.cores).toEqual(all.cores);
  });
});
