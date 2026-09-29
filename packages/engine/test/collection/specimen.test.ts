import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { toSpecimens, fnv1a, megaFormOf, type Specimen } from '../../src/collection/specimen.js';
import { parseCollectionCsv } from '../../src/csv/parse.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { haveStaticData, loadFixtureCsv, loadStaticData, FIXTURES_DIR } from '../fixtures.js';

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

describe('megaFormOf', () => {
  it('treats a specimen without the field (an old save) as unmarked', () => {
    const old = { id: 'x', speciesId: 'sableye' } as Specimen;
    expect(megaFormOf(old)).toBeNull();
    expect(megaFormOf({ ...old, megaForm: 'mega_y' })).toBe('mega_y');
  });
});

describe.skipIf(!haveStaticData())('toSpecimens keeps the Mega mark', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const { specimens } = toSpecimens(parseCollectionCsv(loadFixtureCsv(), index), index);

  it('marks Sableye Mega and Mewtwo Mega Y, and leaves ordinary rows null', () => {
    const sableye = specimens.filter((s) => s.raw.name === 'Sableye' && s.raw.form === 'Mega');
    expect(sableye.length).toBeGreaterThan(0);
    for (const s of sableye) {
      expect(s.speciesId).toBe('sableye');
      expect(s.megaForm).toBe('mega');
    }
    const mewtwo = specimens.filter((s) => s.raw.name === 'Mewtwo' && s.raw.form === 'Mega Y');
    expect(mewtwo.length).toBeGreaterThan(0);
    for (const s of mewtwo) {
      expect(s.megaForm).toBe('mega_y');
    }
    const ordinary = specimens.filter((s) => !s.raw.form.startsWith('Mega'));
    expect(ordinary.length).toBeGreaterThan(10);
    expect(ordinary.every((s) => s.megaForm === null)).toBe(true);
  });

  it('gives the same mark to a folded name with an empty Form', () => {
    const fixture = fs.readFileSync(path.join(FIXTURES_DIR, 'pokegenie-sample.csv'), 'utf8');
    const header = (fixture.split('\n')[0] ?? '').trim();
    const cols = header.split(',');
    const row = cols.map(() => '');
    const set = (col: string, v: string): void => {
      row[cols.indexOf(col)] = v;
    };
    set('Index', '1');
    set('Name', 'Sableye (Mega)');
    set('CP', '804');
    set('HP', '78');
    set('Atk IV', '10');
    set('Def IV', '15');
    set('Sta IV', '14');
    set('Scan Date', '2026-08-31 21:13');
    const parsed = parseCollectionCsv([header, row.join(','), ''].join('\n'), index);
    const { specimens: out } = toSpecimens(parsed, index);
    expect(out).toHaveLength(1);
    expect(out[0]?.speciesId).toBe('sableye');
    expect(out[0]?.megaForm).toBe('mega');
  });

  function csvOf(rows: Record<string, string>[]): string {
    const fixture = fs.readFileSync(path.join(FIXTURES_DIR, 'pokegenie-sample.csv'), 'utf8');
    const header = (fixture.split('\n')[0] ?? '').trim();
    const cols = header.split(',');
    const lines = rows.map((r) => cols.map((c) => r[c] ?? '').join(','));
    return [header, ...lines, ''].join('\n');
  }
  const base = {
    Index: '1',
    Name: 'Sableye',
    CP: '804',
    HP: '78',
    'Atk IV': '10',
    'Def IV': '15',
    'Sta IV': '14',
  };

  it.each([
    ['marked scan is older', 'Mega', '2026-08-01 10:00', '', '2026-08-31 10:00'],
    ['marked scan is newer', '', '2026-08-01 10:00', 'Mega', '2026-08-31 10:00'],
  ])('keeps the mark when duplicates merge (%s)', (_label, f1, d1, f2, d2) => {
    const csv = csvOf([
      { ...base, Form: f1, 'Scan Date': d1 },
      { ...base, Form: f2, 'Scan Date': d2 },
    ]);
    const { specimens: out, report } = toSpecimens(parseCollectionCsv(csv, index), index);
    expect(report.duplicatesMerged).toBe(1);
    expect(out).toHaveLength(1);
    expect(out[0]?.megaForm).toBe('mega');
  });

  it('never marks a shadow row as Mega', () => {
    const csv = csvOf([
      { ...base, Form: 'Mega', 'Shadow/Purified': 'Shadow', 'Scan Date': '2026-08-31 10:00' },
    ]);
    const { specimens: out } = toSpecimens(parseCollectionCsv(csv, index), index);
    expect(out).toHaveLength(1);
    expect(out[0]?.shadow).toBe(true);
    expect(out[0]?.megaForm).toBeNull();
  });
});
