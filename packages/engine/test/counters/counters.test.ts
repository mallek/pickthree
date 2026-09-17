import { describe, expect, it } from 'vitest';
import { toSpecimens } from '../../src/collection/specimen.js';
import { metaCounters } from '../../src/counters/counters.js';
import { parseCollectionCsv } from '../../src/csv/parse.js';
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
  const { specimens } = toSpecimens(parseCollectionCsv(loadFixtureCsv(), index), index);
  const counters = metaCounters(data, specimens, index, { limit: 40 }).entries;

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

describe.skipIf(!haveStaticData())('counters against one opponent', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const { specimens } = toSpecimens(parseCollectionCsv(loadFixtureCsv(), index), index);
  const target = data.matrix.opponents[0]!;

  it('scores every candidate by its win share against that species only', () => {
    const r = metaCounters(data, specimens, index, { limit: 40, vs: target });
    expect(r.vs).toEqual({ speciesId: target, inMeta: true });
    expect(r.blended).toBe(false);
    expect(r.entries.length).toBeGreaterThan(0);
    expect(r.entries.length).toBeLessThanOrEqual(40);
    r.entries.forEach((c, i) => {
      expect(c.antiRank).toBe(i + 1);
      expect(c.speciesId).not.toBe(target);
      expect(c.antiMeta).toBeGreaterThan(0);
      expect(c.antiMeta).toBeLessThanOrEqual(100);
      if (i > 0) {
        expect(c.antiMeta).toBeLessThanOrEqual(r.entries[i - 1]!.antiMeta);
      }
    });
    // Anything listed beats the target in every scenario it is scored 100 for.
    const top = r.entries[0]!;
    expect(top.antiMeta).toBe(100);
    expect(r.facing).toMatch(/one opponent/);
  });

  it('says so when the species is not in the meta group', () => {
    const r = metaCounters(data, specimens, index, { limit: 40, vs: 'not-a-species' });
    expect(r.vs).toEqual({ speciesId: 'not-a-species', inMeta: false });
    expect(r.entries).toEqual([]);
  });

  it('ignores the log while scoring against one opponent', () => {
    const battles = Array.from({ length: 20 }, (_, i) => ({
      id: `b${i}`,
      at: new Date().toISOString(),
      opponents: [target],
      result: 'loss' as const,
      tanked: false,
    }));
    const r = metaCounters(data, specimens, index, {
      limit: 10,
      vs: target,
      yourMeta: { battles, blend: true },
    });
    expect(r.blended).toBe(false);
    expect(r.battles).toBe(0);
  });
});
