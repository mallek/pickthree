import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CPM, MAX_CPM_LEVEL, cpmForLevel } from '../../src/tables/cpm.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const vendored = path.resolve(here, '..', '..', '..', 'sim-pvpoke', 'vendor', 'Pokemon.js');

describe('CP multipliers', () => {
  it('has one entry per half level from 1 to the max level', () => {
    expect(CPM.length).toBe((MAX_CPM_LEVEL - 1) * 2 + 1);
    expect(MAX_CPM_LEVEL).toBeGreaterThanOrEqual(51);
  });
  it('matches known anchors', () => {
    expect(cpmForLevel(1)).toBeCloseTo(0.094, 6);
    expect(cpmForLevel(20)).toBeCloseTo(0.5974, 4);
    expect(cpmForLevel(40)).toBeCloseTo(0.7903, 4);
    expect(cpmForLevel(50)).toBeCloseTo(0.8403, 4);
    expect(cpmForLevel(51)).toBeCloseTo(0.8453, 4);
  });
  it('rejects levels off the half-step grid', () => {
    expect(() => cpmForLevel(20.25)).toThrow();
    expect(() => cpmForLevel(0.5)).toThrow();
    expect(() => cpmForLevel(MAX_CPM_LEVEL + 0.5)).toThrow();
  });
});

describe.skipIf(!fs.existsSync(vendored))('CPM matches vendored PvPoke table', () => {
  it('is identical', () => {
    const src = fs.readFileSync(vendored, 'utf8');
    const match = /var cpms = \[([^\]]+)\]/.exec(src);
    expect(match).not.toBeNull();
    const theirs = (match as RegExpExecArray)[1]!.split(',').map((s) => Number(s.trim()));
    expect(CPM).toEqual(theirs);
  });
});
