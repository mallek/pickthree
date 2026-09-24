import { describe, expect, it } from 'vitest';
import type { MatchupMatrix } from '../../src/gamedata/types.js';
import type { StaticData } from '../../src/recommend.js';
import { MatrixView } from '../../src/search/matrixView.js';
import { heaviestColumns, profileFor } from '../../src/yourmeta/facing.js';
import { facingLine } from '../../src/yourmeta/profile.js';

const matrix = {
  league: 'great',
  cp: 1500,
  scenarios: [{ shields: [1, 1], energy: [0, 0] }],
  candidates: [],
  opponents: ['azumarill', 'medicham', 'registeel'],
  candidateMovesets: {},
  opponentMovesets: {},
  ratings: [],
} as unknown as MatchupMatrix;
const view = new MatrixView(matrix);
const data = {
  meta: matrix.opponents.map((speciesId) => ({ speciesId, fastMove: 'F', chargedMoves: ['C'] })),
  rankings: {
    overall: matrix.opponents.map((speciesId) => ({ speciesId, moveset: ['F', 'C'] })),
    leads: [],
    switches: [],
    closers: [],
    chargers: [],
  },
} as unknown as StaticData;

describe('profileFor', () => {
  it('treats a missing input as PvPoke', () => {
    const p = profileFor(data, view, undefined);
    expect(p.engaged).toBe(false);
    expect(p.source).toBe('prior');
    expect(facingLine(p)).toBe('PvPoke weights only');
  });

  it('says so when a community source fell back', () => {
    const p = profileFor(data, view, { kind: 'prior', unavailable: 'ladder' });
    expect(p.engaged).toBe(false);
    expect(facingLine(p)).toBe('PvPoke weights (community data unavailable)');
  });

  it('keeps the log path, too-few included', () => {
    const p = profileFor(data, view, { kind: 'log', battles: [] });
    expect(p.source).toBe('log');
    expect(facingLine(p)).toBe('PvPoke weights only (0 of 15 battles logged)');
  });

  it('builds a community profile', () => {
    const p = profileFor(data, view, {
      kind: 'community',
      source: 'all',
      summary: { battles: 0, devices: 0, species: [], tournament: null },
      window: {
        since: '2026-09-17T00:00:00.000Z',
        until: '2026-09-24T00:00:00.000Z',
        label: '7 days',
      },
    });
    expect(p.engaged).toBe(true);
    expect(p.source).toBe('all');
  });
});

describe('heaviestColumns', () => {
  it('orders column indexes by weight, ties by column order', () => {
    const w = new Map([
      ['azumarill', 0.1],
      ['medicham', 0.5],
      ['registeel', 0.1],
    ]);
    expect(heaviestColumns(view, w, 2)).toEqual([1, 0]);
  });
});
