import { describe, expect, it } from 'vitest';
import { ImportError, parseCollectionCsv, type IVs, type RawScan } from '../../src/csv/parse.js';
import { toSpecimens } from '../../src/collection/specimen.js';
import { haveStaticData, loadFixtureCsv, loadIndex } from '../fixtures.js';

describe.skipIf(!haveStaticData())('parseCollectionCsv', () => {
  const index = loadIndex();

  it('parses the Poke Genie sample with no row problems', () => {
    const parsed = parseCollectionCsv(loadFixtureCsv(), index);
    expect(parsed.layout.format).toBe('poke-genie');
    expect(parsed.layout.hasHeader).toBe(true);
    expect(parsed.layout.columnCount).toBe(50);
    expect(parsed.layout.confidence).toBeGreaterThan(0.9);
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows.length).toBe(parsed.totalLines);
    expect(parsed.rows.length).toBeGreaterThanOrEqual(100);
    const blankIv = parsed.rows.filter((r) => r.ivs === null).length;
    expect(blankIv).toBeGreaterThanOrEqual(10);
    const shadows = parsed.rows.filter((r) => r.shadowCode === 1);
    expect(shadows.length).toBeGreaterThan(5);
    const frustration = parsed.rows.filter((r) => r.chargedMoves.includes('Frustration'));
    expect(frustration.length).toBeGreaterThan(0);
    expect(frustration.every((r) => r.shadowCode === 1)).toBe(true);
    const ranges = parsed.rows.filter((r) => r.levelMin !== r.levelMax);
    expect(ranges.length).toBeGreaterThanOrEqual(1);
    expect(parsed.rows.every((r) => r.levelDerived === false)).toBe(true);
  });

  it('reads Poke Genie oracle columns as numbers', () => {
    const parsed = parseCollectionCsv(loadFixtureCsv(), index);
    const withRank = parsed.rows.filter((r) => r.pokeGenie.rankNumG !== null);
    expect(withRank.length).toBeGreaterThan(30);
    const r = withRank[0] as (typeof withRank)[number];
    expect(r.pokeGenie.rankPctG).toBeGreaterThan(0);
    expect(r.pokeGenie.rankPctG).toBeLessThanOrEqual(100);
  });

  it('collects problems for malformed rows and keeps the good ones', () => {
    const parsed = parseCollectionCsv(loadFixtureCsv('pokegenie-malformed.csv'), index);
    expect(parsed.rows.length).toBe(10);
    expect(parsed.problems.map((p) => p.kind).sort()).toEqual([
      'bad-number',
      'field-count',
      'iv-out-of-range',
    ]);
  });

  it('takes a renamed move column in its stride and skips unknown ones', () => {
    const parsed = parseCollectionCsv(loadFixtureCsv('pokegenie-renamed-column.csv'), index);
    expect(parsed.layout.unused).toContain('Notes');
    expect(parsed.rows.some((r) => r.fastMove !== null)).toBe(true);
  });

  it('fails naming the missing concept, never a tool', () => {
    const text = loadFixtureCsv();
    const lines = text.split('\n');
    const header = (lines[0] as string).split(',');
    const cpIndex = header.indexOf('CP');
    const without = lines.map((l) => {
      const f = l.split(',');
      f.splice(cpIndex, 1);
      return f.join(',');
    });
    expect(() => parseCollectionCsv(without.join('\n'), index)).toThrow(ImportError);
    expect(() => parseCollectionCsv(without.join('\n'), index)).toThrow(/CP/);
    expect(() => parseCollectionCsv(without.join('\n'), index)).not.toThrow(/Poke Genie/);
  });

  it('strips a BOM', () => {
    const parsed = parseCollectionCsv('\uFEFF' + loadFixtureCsv(), index);
    expect(parsed.layout.columns.find((c) => c.concept === 'name')?.index).toBe(1);
  });

  it('refuses an Excel file with a pointer to CSV', () => {
    expect(() => parseCollectionCsv('PKrest', index)).toThrow(/CSV/);
  });

  it('refuses an empty file', () => {
    expect(() => parseCollectionCsv('  \n', index)).toThrow(/empty/);
  });
});

/** The rows every derived fixture shares with the sample, keyed on what identifies a Pokémon. */
function key(r: RawScan): string {
  const ivs = r.ivs ? `${r.ivs.atk}/${r.ivs.def}/${r.ivs.sta}` : 'noiv';
  return `${r.speciesId}|${r.cp}|${ivs}`;
}

describe.skipIf(!haveStaticData())('other layouts resolve to the same Pokémon', () => {
  const index = loadIndex();
  const sample = parseCollectionCsv(loadFixtureCsv(), index);
  const sampleKeys = new Set(sample.rows.map(key));

  function sameAsSample(name: string, expectFormat: string): ReturnType<typeof parseCollectionCsv> {
    const parsed = parseCollectionCsv(loadFixtureCsv(name), index);
    expect(parsed.layout.format).toBe(expectFormat);
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows.length).toBe(sample.rows.length);
    const keys = parsed.rows.map(key);
    const shared = keys.filter((k) => sampleKeys.has(k)).length;
    expect(shared).toBe(sample.rows.length);
    return parsed;
  }

  it('Poke Genie 2025 layout (Pokemon, Stat Product, no Original Scan Date)', () => {
    const parsed = sameAsSample('pokegenie-2025.csv', 'poke-genie');
    expect(parsed.layout.columns.find((c) => c.concept === 'dex')?.header).toBe('Pokemon');
    expect(parsed.layout.missing).toContain('originalScanDate');
    expect(parsed.rows.every((r) => r.dex > 0)).toBe(true);
  });

  it('Calcy IV style headers with yes/no flags', () => {
    const parsed = sameAsSample('calcy-iv-sample.csv', 'calcy-iv');
    const shadows = parsed.rows.filter((r) => r.shadowCode === 1).length;
    expect(shadows).toBe(sample.rows.filter((r) => r.shadowCode === 1).length);
    const purified = parsed.rows.filter((r) => r.shadowCode === 2).length;
    expect(purified).toBe(sample.rows.filter((r) => r.shadowCode === 2).length);
    expect(parsed.rows.some((r) => r.fastMove !== null)).toBe(true);
  });

  it('a hand-made sheet with forms and shadows folded into the name', () => {
    const parsed = sameAsSample('sheet-headers.csv', 'sheet');
    const shadows = parsed.rows.filter((r) => r.shadowCode === 1).length;
    expect(shadows).toBe(sample.rows.filter((r) => r.shadowCode === 1).length);
    expect(parsed.layout.missing).toContain('scanDate');
    const known = parsed.rows.filter((r) => r.speciesId !== null);
    expect(known.every((r) => r.hp > 0 || r.ivs === null)).toBe(true);
  });

  it('a tab separated sheet with no header and no level', () => {
    const parsed = sameAsSample('sheet-noheader.tsv', 'sheet');
    expect(parsed.layout.hasHeader).toBe(false);
    expect(parsed.layout.delimiter).toBe('\t');
    expect(parsed.layout.ivOrderAssumed).toBe(true);
    const withIvs = parsed.rows.filter((r) => r.ivs !== null && r.speciesId !== null);
    expect(withIvs.every((r) => r.levelDerived && r.levelMin > 0)).toBe(true);
    // derived levels land on the file's own for exact-CP rows
    const bySample = new Map(sample.rows.map((r) => [key(r), r]));
    const agree = withIvs.filter((r) => bySample.get(key(r))?.levelMin === r.levelMin).length;
    expect(agree / withIvs.length).toBeGreaterThan(0.9);
  });

  it('a semicolon sheet with forms in parentheses', () => {
    const parsed = sameAsSample('sheet-semicolon.csv', 'sheet');
    expect(parsed.layout.delimiter).toBe(';');
    expect(parsed.layout.columns.find((c) => c.concept === 'shadow')?.header).toBe('Shadow');
  });

  it('every layout yields the same specimens as the sample', () => {
    // Identity leaves out the level: a single-level sheet cannot carry Poke Genie's level ranges.
    const who = (s: { speciesId: string; shadow: boolean; ivs: IVs | null; cp: number }): string =>
      `${s.speciesId}|${s.shadow}|${s.ivs ? `${s.ivs.atk}/${s.ivs.def}/${s.ivs.sta}` : s.cp}`;
    const base = new Set(toSpecimens(sample, index).specimens.map(who));
    for (const name of ['pokegenie-2025.csv', 'calcy-iv-sample.csv', 'sheet-semicolon.csv']) {
      const { specimens } = toSpecimens(parseCollectionCsv(loadFixtureCsv(name), index), index);
      const shared = specimens.filter((s) => base.has(who(s))).length;
      expect(shared, name).toBe(base.size);
    }
  });
});
