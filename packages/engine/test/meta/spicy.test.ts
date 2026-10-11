import { describe, expect, it } from 'vitest';
import { spicyPicks } from '../../src/meta/index.js';

/** Twelve species, s0 heaviest; s0..s9 are the top 10 the card skips. */
const order = Array.from({ length: 12 }, (_, i) => `s${i}`);

function weights(entries: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(entries));
}

describe('spicyPicks', () => {
  it('keeps species above PvPoke outside the top 10, by how far above', () => {
    const now = weights({ s0: 0.2, s9: 0.05, s10: 0.03, s11: 0.02 });
    // s0 and s9 are far above PvPoke but already the meta; s10 is listed, s11 is not.
    const prior = weights({ s0: 0.01, s9: 0.01, s10: 0.025 });
    expect(spicyPicks(order, now, prior)).toEqual([
      { speciesId: 's11', above: 0.02, offMeta: true },
      { speciesId: 's10', above: 0.03 - 0.025, offMeta: false },
    ]);
  });

  it('drops a species at or below its PvPoke share, and one under the share floor', () => {
    const now = weights({ s10: 0.02, s11: 0.009 });
    const prior = weights({ s10: 0.02 });
    expect(spicyPicks(order, now, prior)).toEqual([]);
  });

  it('breaks a tie in how far above by current rank', () => {
    const now = weights({ s10: 0.02, s11: 0.02 });
    expect(spicyPicks(order, now, new Map()).map((p) => p.speciesId)).toEqual(['s10', 's11']);
  });

  it('caps the list, five by default, and takes its cutoffs as options', () => {
    const now = new Map(order.map((id) => [id, 0.05] as const));
    expect(spicyPicks(order, now, new Map(), { skipTop: 0 })).toHaveLength(5);
    expect(spicyPicks(order, now, new Map(), { skipTop: 0, limit: 7 })).toHaveLength(7);
    expect(spicyPicks(order, now, new Map(), { skipTop: 11 })).toHaveLength(1);
    expect(spicyPicks(order, now, new Map(), { skipTop: 0, minShare: 0.06 })).toEqual([]);
  });

  it('is empty when the blend is PvPoke alone', () => {
    const prior = new Map(order.map((id, i) => [id, 0.1 - i * 0.005] as const));
    expect(spicyPicks(order, prior, prior)).toEqual([]);
  });
});
