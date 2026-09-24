import { describe, expect, it } from 'vitest';
import { MatrixView } from '../../src/search/matrixView.js';
import type { MatchupMatrix } from '../../src/gamedata/types.js';
import {
  PROJECTION_ANCHOR,
  PROJECTION_SLOPE,
  bestStrength,
  expectedWinRate,
  strengthContext,
  strengthOf,
} from '../../src/score/simStrength.js';

/** Four candidates, four opponents, the three real scenarios, ratings supplied by hand. */
function fixture(rate: (c: number, o: number, s: number) => number): MatrixView {
  const candidates = ['a', 'b', 'c', 'd'];
  const opponents = ['w', 'x', 'y', 'z'];
  const scenarios = [
    { shields: [0, 0] as [number, number], energy: [0, 0] as [number, number] },
    { shields: [1, 1] as [number, number], energy: [0, 0] as [number, number] },
    { shields: [2, 2] as [number, number], energy: [0, 0] as [number, number] },
  ];
  const ratings: number[] = [];
  candidates.forEach((_, c) => {
    opponents.forEach((_, o) => {
      scenarios.forEach((_, s) => {
        ratings.push(rate(c, o, s));
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

/** a beats w and x in every scenario, b beats y and z, c and d lose everything badly. */
const SPLIT = fixture((c, o) => {
  if (c === 0) {
    return o < 2 ? 700 : 400;
  }
  if (c === 1) {
    return o >= 2 ? 700 : 400;
  }
  return 200;
});

describe('strengthContext', () => {
  it('weighs every column the same when no weights are given', () => {
    const ctx = strengthContext(SPLIT);
    expect(ctx.weights).toEqual([1, 1, 1, 1]);
    expect(ctx.weightCovered).toBe(1);
    expect(ctx.top).toEqual([0, 1, 2, 3]);
  });

  it('reports how much of the supplied weight the columns actually cover', () => {
    // 'outsider' is faced but has no column: a projection cannot speak for it.
    const ctx = strengthContext(
      SPLIT,
      new Map([
        ['w', 0.4],
        ['x', 0.1],
        ['outsider', 0.5],
      ]),
    );
    expect(ctx.weightCovered).toBeCloseTo(0.5, 10);
    expect(ctx.weights).toEqual([0.4, 0.1, 0, 0]);
    expect(ctx.top.slice(0, 2)).toEqual([0, 1]);
  });
});

describe('strengthOf', () => {
  it('covers every opponent when two members split the meta between them', () => {
    const s = strengthOf(strengthContext(SPLIT), [0, 1, 2]);
    expect(s.coverage).toBe(100);
    expect(s.consistency).toBe(100);
    expect(s.safety).toBe(100);
    expect(s.value).toBe(100);
    expect(s.order).toEqual([0, 1, 2]);
  });

  it('docks safety for a switch with hard losses and for an uncovered top opponent', () => {
    // c leads, d switches (four ratings of 200, four hard losses), a closes.
    const s = strengthOf(strengthContext(SPLIT), [2, 3, 0]);
    expect(s.coverage).toBe(50);
    expect(s.safety).toBe(0);
  });

  it('weighs coverage by how often each opponent is actually faced', () => {
    const ctx = strengthContext(
      SPLIT,
      new Map([
        ['w', 0.7],
        ['x', 0.1],
        ['y', 0.1],
        ['z', 0.1],
      ]),
    );
    // a alone covers w and x: 0.8 of the weight, against 0.5 of the raw count.
    expect(strengthOf(ctx, [0, 2, 3]).coverage).toBeCloseTo(80, 6);
  });
});

describe('bestStrength', () => {
  it('scores the team in its best order, not the order it was handed', () => {
    const ctx = strengthContext(SPLIT);
    const handed = strengthOf(ctx, [2, 3, 0]);
    const best = bestStrength(ctx, [2, 3, 0]);
    expect(best.value).toBeGreaterThan(handed.value);
    // The best order puts a competent member in the switch slot.
    expect(best.order[1]).toBe(0);
  });

  it('is order independent', () => {
    const ctx = strengthContext(SPLIT);
    expect(bestStrength(ctx, [0, 1, 2]).value).toBe(bestStrength(ctx, [2, 1, 0]).value);
  });
});

describe('expectedWinRate', () => {
  it('reads an even battle score as an even match', () => {
    // A perfect team (100 on all three factors) anchors at exactly even: nothing unplayed may
    // project a winning record.
    expect(expectedWinRate(PROJECTION_ANCHOR)).toBeCloseTo(0.5, 10);
  });

  it('moves one slope per point either side of even', () => {
    expect(expectedWinRate(PROJECTION_ANCHOR + 10)).toBeCloseTo(0.5 + 10 * PROJECTION_SLOPE, 10);
    expect(expectedWinRate(PROJECTION_ANCHOR - 10)).toBeCloseTo(0.5 - 10 * PROJECTION_SLOPE, 10);
  });

  it('never leaves 0 to 1, however extreme the score or the slope', () => {
    // 300 is well past any real battle score, needed only to push the clamp past 1 at this slope.
    expect(expectedWinRate(300, 0.05)).toBe(1);
    expect(expectedWinRate(0, 0.05)).toBe(0);
  });
});

describe('the meta subpath', () => {
  it('exports exactly the seam, and nothing else', async () => {
    const mod = (await import('@pickthree/engine/meta')) as Record<string, unknown>;
    expect(typeof mod['blendWeights']).toBe('function');
    expect(typeof mod['bestStrength']).toBe('function');
    expect(typeof mod['expectedWinRate']).toBe('function');
    // A short list on purpose: this is the contract, and growing it should be deliberate.
    expect(Object.keys(mod).sort()).toEqual([
      'DEFAULT_BLEND_OPTIONS',
      'HALF_SAY_BATTLES',
      'HALF_SAY_DEVICES',
      'HALF_SAY_EVENTS',
      'HALF_SAY_TOURNAMENT_BATTLES',
      'LISTED_MIN',
      'MatrixView',
      'OPEN_EQUIVALENT_CUP',
      'PROJECTION_SLOPE',
      'bestStrength',
      'blendShare',
      'blendWeights',
      'communityWeights',
      'expectedWinRate',
      'facingWeight',
      'legalFor',
      'matrixIndex',
      'measuredSay',
      'ranksOf',
      'strengthContext',
      'strengthOf',
      'tournamentSay',
    ]);
  });
});
