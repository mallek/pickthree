import { describe, expect, it } from 'vitest';
import { toSpecimens, fnv1a } from '../../src/collection/specimen.js';
import { parseCollectionCsv } from '../../src/csv/parse.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { haveStaticData, loadFixtureCsv, loadStaticData } from '../fixtures.js';

describe('fnv1a', () => {
  it('is stable and 8 hex chars', () => {
    expect(fnv1a('abc')).toBe(fnv1a('abc'));
    expect(fnv1a('abc')).toMatch(/^[0-9a-f]{8}$/);
    expect(fnv1a('abc')).not.toBe(fnv1a('abd'));
  });
});

describe.skipIf(!haveStaticData())('toSpecimens', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const parsed = parseCollectionCsv(loadFixtureCsv(), index);
  const { specimens, report } = toSpecimens(parsed, index);

  it('accounts for every scan', () => {
    const unrecognizedRows = report.unrecognized.reduce((n, u) => n + u.count, 0);
    expect(
      report.recognized + report.duplicatesMerged + unrecognizedRows + report.rowProblems.length,
    ).toBe(report.scansRead);
    expect(report.recognized).toBe(specimens.length);
    expect(report.scansRead).toBe(parsed.totalLines);
  });

  it('merges planted duplicates and counts blank IVs', () => {
    expect(report.duplicatesMerged).toBeGreaterThanOrEqual(2);
    expect(report.missingIvs.count).toBeGreaterThanOrEqual(10);
    expect(report.missingIvs.names.length).toBe(report.missingIvs.count);
  });

  it('reports the unsupported Gimmighoul form and nothing else unexpected', () => {
    const reasons = report.unrecognized.map((u) => `${u.name}|${u.form}:${u.reason}`);
    expect(reasons.filter((r) => !r.startsWith('Gimmighoul|Roaming'))).toEqual([]);
  });

  it('maps scanned move names to PvPoke ids', () => {
    const frustration = specimens.filter((s) => s.currentMoves.charged.includes('FRUSTRATION'));
    expect(frustration.length).toBeGreaterThan(0);
    expect(frustration.every((s) => s.shadow)).toBe(true);
    const withFast = specimens.filter((s) => s.currentMoves.fast !== null);
    expect(withFast.length).toBeGreaterThan(10);
    for (const s of withFast) {
      expect(index.move(s.currentMoves.fast as string)).toBeDefined();
    }
  });

  it('keeps shadow variants as _shadow species ids', () => {
    const shadows = specimens.filter((s) => s.shadow);
    expect(shadows.length).toBeGreaterThan(5);
    expect(shadows.every((s) => s.speciesId.endsWith('_shadow'))).toBe(true);
  });

  it('records the newest scan date', () => {
    expect(report.newestScan).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});
