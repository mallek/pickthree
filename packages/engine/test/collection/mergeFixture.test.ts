import { describe, expect, it } from 'vitest';
import { mergeScan } from '../../src/collection/merge.js';
import { toSpecimens, type Specimen } from '../../src/collection/specimen.js';
import { parseCollectionCsv } from '../../src/csv/parse.js';
import { haveStaticData, loadFixtureCsv, loadIndex } from '../fixtures.js';

describe.skipIf(!haveStaticData())('merging the rescan fixture', () => {
  const index = loadIndex();
  const read = (name: string): Specimen[] =>
    toSpecimens(parseCollectionCsv(loadFixtureCsv(name), index), index).specimens;
  const first = mergeScan([], [], read('pokegenie-sample.csv'), index, '2026-10-01 12:00:00');
  const rescan = read('pokegenie-rescan.csv');
  const second = mergeScan(first.specimens, [], rescan, index, '2026-10-01 12:00:00');

  it('accounts for every scan row', () => {
    const b = second.breakdown;
    expect(b.added + b.merged + b.skipped).toBe(rescan.length);
    expect(second.specimens.length).toBe(first.specimens.length + b.added);
  });

  it('updates the powered-up rows, adds the new ones and reports the missing ones', () => {
    const b = second.breakdown;
    expect(b.updated).toBeGreaterThan(0);
    expect(b.updated).toBeLessThan(b.merged);
    expect(b.added).toBeGreaterThan(0);
    expect(b.notInScan.length).toBeGreaterThan(0);
  });

  it('keeps every stored id, and every id is unique', () => {
    const ids = second.specimens.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of first.specimens) {
      expect(ids).toContain(s.id);
    }
  });

  it('the same rescan again is a no-op', () => {
    const third = mergeScan(second.specimens, [], rescan, index, '2026-10-02 12:00:00');
    expect(third.breakdown).toMatchObject({ added: 0, updated: 0 });
    expect(third.specimens).toEqual(second.specimens);
  });
});
