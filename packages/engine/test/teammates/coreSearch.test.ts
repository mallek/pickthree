import { describe, expect, it } from 'vitest';
import type { MatchupMatrix } from '../../src/gamedata/types.js';
import type { Candidate } from '../../src/search/candidates.js';
import { MatrixView } from '../../src/search/matrixView.js';
import { strengthContext } from '../../src/score/simStrength.js';
import { search } from '../../src/teammates/suggest.js';

/** Six fighters, four opponents, one identical win pattern each; the rules are what is tested. */
function world(): { view: MatrixView } {
  const candidates = ['a', 'b', 'c', 'd', 'e', 'f'];
  const opponents = ['o1', 'o2', 'o3', 'o4'];
  const scenarios: MatchupMatrix['scenarios'] = [
    { shields: [0, 0], energy: [0, 0] },
    { shields: [1, 1], energy: [0, 0] },
    { shields: [2, 2], energy: [0, 0] },
  ];
  const ratings: number[] = [];
  candidates.forEach((_, c) => {
    for (let o = 0; o < opponents.length; o++) {
      for (let s = 0; s < scenarios.length; s++) {
        ratings.push((c + o) % 2 === 0 ? 700 : 300);
      }
    }
  });
  const matrix: MatchupMatrix = {
    league: 'great',
    cp: 1500,
    scenarios,
    candidates,
    opponents,
    candidateMovesets: {},
    opponentMovesets: {},
    ratings,
  };
  return { view: new MatrixView(matrix) };
}

function cand(id: string, row: number, opts: { specimen?: string; mega?: boolean }): Candidate {
  return {
    build: {
      specimenId: opts.specimen ?? `s${id}`,
      speciesId: id,
      mega: opts.mega ? { ready: true, level4: false } : null,
    },
    cost: { weight: 1 },
    matrixRow: row,
  } as unknown as Candidate;
}

const owned = new Set<string>();
const baseOf = (id: string): string => id.replace(/_mega$/, '');

describe('teammate core search team rules', () => {
  it('offers no Mega fill when a Mega is pinned', () => {
    const { view } = world();
    const ctx = strengthContext(view);
    const pin = cand('a', 0, { mega: true });
    const pool = [
      cand('b', 1, { mega: true }),
      cand('c', 2, {}),
      cand('d', 3, {}),
      cand('e', 4, {}),
    ];
    const cores = search(ctx, ctx, [pin], pool, 2, owned);
    expect(cores.length).toBeGreaterThan(0);
    for (const core of cores) {
      expect(core.fills.some((c) => c.build.mega !== null)).toBe(false);
    }
    const one = search(ctx, ctx, [pin], pool, 1, owned);
    expect(one.length).toBe(3);
  });

  it('never fills two slots with two Megas', () => {
    const { view } = world();
    const ctx = strengthContext(view);
    const pin = cand('a', 0, {});
    const pool = [cand('b', 1, { mega: true }), cand('c', 2, { mega: true }), cand('d', 3, {})];
    const cores = search(ctx, ctx, [pin], pool, 2, owned);
    // b+c is barred; b+d and c+d remain.
    expect(cores.map((c) => c.key).sort()).toEqual(['b+d', 'c+d']);
  });

  it('never fills with a build of a specimen the pin already uses', () => {
    const { view } = world();
    const ctx = strengthContext(view);
    const pin = cand('a', 0, { specimen: 'shared' });
    const pool = [cand('b', 1, { specimen: 'shared', mega: true }), cand('c', 2, {})];
    const cores = search(ctx, ctx, [pin], pool, 1, owned);
    expect(cores.map((c) => c.key)).toEqual(['c']);
  });

  it('never fills with the Mega of the pinned species, or the base of a pinned Mega', () => {
    const { view } = world();
    const ctx = strengthContext(view);
    // A species-pinned stand-in (specimen species:x) against an owned Mega fill of x.
    const stand = cand('x', 0, { specimen: 'species:x' });
    const pool = [cand('x_mega', 1, { mega: true }), cand('c', 2, {}), cand('d', 3, {})];
    const cores = search(ctx, ctx, [stand], pool, 1, owned, baseOf);
    expect(cores.map((c) => c.key)).toEqual(['c', 'd']);

    const megaPin = cand('x_mega', 0, { mega: true });
    const basePool = [cand('x', 1, {}), cand('c', 2, {})];
    expect(search(ctx, ctx, [megaPin], basePool, 1, owned, baseOf).map((c) => c.key)).toEqual([
      'c',
    ]);
  });

  it('never fills two slots with a species and its Mega', () => {
    const { view } = world();
    const ctx = strengthContext(view);
    const pin = cand('a', 0, {});
    const pool = [cand('x', 1, {}), cand('x_mega', 2, { mega: true }), cand('d', 3, {})];
    const cores = search(ctx, ctx, [pin], pool, 2, owned, baseOf);
    expect(cores.map((c) => c.key).sort()).toEqual(['d+x', 'd+x_mega']);
  });
});
