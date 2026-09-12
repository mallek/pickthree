import { describe, expect, it } from 'vitest';
import { ImportError, parsePokeGenieCsv } from '../../src/csv/parse.js';
import { loadFixtureCsv } from '../fixtures.js';

describe('parsePokeGenieCsv', () => {
  it('parses the sample fixture with no row problems', () => {
    const parsed = parsePokeGenieCsv(loadFixtureCsv());
    expect(parsed.header.ok).toBe(true);
    expect(parsed.header.columnCount).toBe(50);
    expect(parsed.header.missingOptional).toEqual([]);
    expect(parsed.header.unknown).toEqual([]);
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
  });

  it('reads Poke Genie oracle columns as numbers', () => {
    const parsed = parsePokeGenieCsv(loadFixtureCsv());
    const withRank = parsed.rows.filter((r) => r.pokeGenie.rankNumG !== null);
    expect(withRank.length).toBeGreaterThan(30);
    const r = withRank[0] as (typeof withRank)[number];
    expect(r.pokeGenie.rankPctG).toBeGreaterThan(0);
    expect(r.pokeGenie.rankPctG).toBeLessThanOrEqual(100);
  });

  it('collects problems for malformed rows and keeps the good ones', () => {
    const parsed = parsePokeGenieCsv(loadFixtureCsv('pokegenie-malformed.csv'));
    expect(parsed.rows.length).toBe(10);
    expect(parsed.problems.map((p) => p.kind).sort()).toEqual([
      'bad-number',
      'field-count',
      'iv-out-of-range',
    ]);
  });

  it('tolerates renamed and unknown columns, reporting them', () => {
    const parsed = parsePokeGenieCsv(loadFixtureCsv('pokegenie-renamed-column.csv'));
    expect(parsed.header.ok).toBe(true);
    expect(parsed.header.missingOptional).toEqual(['Quick Move']);
    expect(parsed.header.unknown.sort()).toEqual(['Fast Move', 'Notes']);
    expect(parsed.rows.every((r) => r.fastMove === null)).toBe(true);
  });

  it('throws ImportError naming the missing required column', () => {
    const text = loadFixtureCsv();
    const lines = text.split('\n');
    const header = (lines[0] as string).split(',');
    const cpIndex = header.indexOf('CP');
    const without = lines.map((l) => {
      const f = l.split(',');
      f.splice(cpIndex, 1);
      return f.join(',');
    });
    expect(() => parsePokeGenieCsv(without.join('\n'))).toThrow(ImportError);
    expect(() => parsePokeGenieCsv(without.join('\n'))).toThrow(/CP/);
  });

  it('strips a BOM', () => {
    const parsed = parsePokeGenieCsv('\uFEFF' + loadFixtureCsv());
    expect(parsed.header.ok).toBe(true);
  });
});
