import { describe, expect, it } from 'vitest';
import { toSpecimens } from '../../src/collection/specimen.js';
import { metaCounters } from '../../src/counters/counters.js';
import { parsePokeGenieCsv } from '../../src/csv/parse.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { facingWeight } from '../../src/gamedata/metaRank.js';
import { haveStaticData, loadFixtureCsv, loadStaticData } from '../fixtures.js';

describe('facing weight', () => {
  it('drops with rank and treats unranked as rare', () => {
    expect(facingWeight(1)).toBe(1);
    expect(facingWeight(4)).toBeCloseTo(0.5);
    expect(facingWeight(16)).toBeCloseTo(0.25);
    expect(facingWeight(null)).toBeLessThan(facingWeight(40));
  });
});

describe.skipIf(!haveStaticData())('meta counters', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const { specimens } = toSpecimens(parsePokeGenieCsv(loadFixtureCsv()), index);
  const counters = metaCounters(data, specimens, index, { limit: 40 });

  it('ranks by anti-meta score, best first', () => {
    expect(counters).toHaveLength(40);
    counters.forEach((c, i) => {
      expect(c.antiRank).toBe(i + 1);
      if (i > 0) {
        expect(c.antiMeta).toBeLessThanOrEqual(counters[i - 1]!.antiMeta);
      }
      expect(c.antiMeta).toBeGreaterThan(0);
      expect(c.antiMeta).toBeLessThanOrEqual(100);
    });
  });

  it('lists the most common opponents first in beats and losesTo', () => {
    for (const c of counters) {
      const ranksOf = (m: { opponentRank: number | null }[]): number[] =>
        m.map((x) => x.opponentRank ?? 9999);
      const b = ranksOf(c.beats);
      expect([...b].sort((x, y) => x - y)).toEqual(b);
      expect(c.beats.length).toBeLessThanOrEqual(5);
      expect(c.losesTo.length).toBeLessThanOrEqual(3);
      for (const m of c.beats) {
        expect(m.scenarios).toBeGreaterThanOrEqual(2);
      }
      for (const m of c.losesTo) {
        expect(m.scenarios).toBe(0);
        expect(m.opponent).not.toBe(c.speciesId);
      }
    }
  });

  it('marks what the collection owns or can build', () => {
    const marked = counters.filter((c) => c.owned !== 'none');
    expect(marked.length).toBeGreaterThan(0);
    for (const c of marked) {
      expect(c.ownedSpecimenId).not.toBeNull();
      expect(specimens.some((s) => s.id === c.ownedSpecimenId)).toBe(true);
      if (c.owned === 'have') {
        expect(c.ownedStageOffset).toBe(0);
      } else {
        expect(c.ownedStageOffset).toBeGreaterThan(0);
      }
    }
  });

  it('computes the gap against the overall rank', () => {
    for (const c of counters) {
      if (c.overallRank !== null) {
        expect(c.gap).toBe(c.overallRank - c.antiRank);
      }
    }
  });
});
