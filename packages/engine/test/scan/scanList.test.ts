import { describe, expect, it } from 'vitest';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { compressRanges, scanList } from '../../src/scan/scanList.js';
import { haveStaticData, loadStaticData } from '../fixtures.js';

describe('compressRanges', () => {
  it('collapses runs and drops duplicates', () => {
    expect(compressRanges([3, 1, 2, 7, 9, 9, 10])).toBe('1-3,7,9-10');
    expect(compressRanges([5])).toBe('5');
    expect(compressRanges([])).toBe('');
  });
});

describe.skipIf(!haveStaticData())('scan list', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const list = scanList(data, index);

  it('builds a GO search string under the CP cap', () => {
    expect(list.search.startsWith('cp-1500&')).toBe(true);
    expect(list.search.length).toBeLessThan(3000);
    expect(list.search).toMatch(/^cp-1500&[0-9,-]+$/);
  });

  it('covers the top picks and their pre-evolutions', () => {
    const top = data.rankings.overall[0]!.speciesId;
    const topDex = index.mustSpecies(top).dex;
    const nums = new Set<number>();
    for (const part of list.search.split('&')[1]!.split(',')) {
      const [a, b] = part.split('-').map(Number);
      for (let n = a!; n <= (b ?? a!); n++) {
        nums.add(n);
      }
    }
    expect(nums.has(topDex)).toBe(true);
    // Swampert's line: Mudkip 258 and Marshtomp 259 ride along with Swampert 260.
    if (nums.has(260)) {
      expect(nums.has(258)).toBe(true);
      expect(nums.has(259)).toBe(true);
    }
    expect(nums.size).toBe(list.dexCount);
    expect(list.sources.overall).toBe(100);
    expect(list.sources.preEvolutions).toBeGreaterThan(0);
    expect(list.speciesCount).toBe(
      list.sources.overall + list.sources.counters + list.sources.preEvolutions,
    );
  });
});
