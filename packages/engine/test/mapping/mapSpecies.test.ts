import { describe, expect, it } from 'vitest';
import { parsePokeGenieCsv } from '../../src/csv/parse.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { mapSpecies, slug } from '../../src/mapping/mapSpecies.js';
import { haveStaticData, loadFixtureCsv, loadStaticData } from '../fixtures.js';

describe('slug', () => {
  it('normalizes names', () => {
    expect(slug('Flabébé')).toBe('flabebe');
    expect(slug("Farfetch'd")).toBe('farfetch_d');
    expect(slug('Mr. Mime')).toBe('mr_mime');
    expect(slug('Nidoran♀')).toBe('nidoran_f');
  });
});

describe.skipIf(!haveStaticData())('mapSpecies', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const ok = (name: string, form: string, shadow = false): string => {
    const r = mapSpecies(name, form, shadow, index);
    if (!r.ok) {
      throw new Error(`${name}|${form} failed: ${r.reason} (${r.tried})`);
    }
    return r.speciesId;
  };

  it('maps plain species and forms', () => {
    expect(ok('Azumarill', '')).toBe('azumarill');
    expect(ok('Sableye', 'Normal')).toBe('sableye');
    expect(ok('Sableye', 'Mega')).toBe('sableye');
    expect(ok('Stunfisk', 'Galar')).toBe('stunfisk_galarian');
    expect(ok('Giratina', 'Origin')).toBe('giratina_origin');
    expect(ok('Giratina', 'Altered')).toBe('giratina_altered');
    expect(ok('Zygarde', '10%')).toBe('zygarde_10');
    expect(ok('Mewtwo', 'Armored')).toBe('mewtwo_armored');
    expect(ok('Charizard', 'Mega Y')).toBe('charizard');
    expect(ok('Flabébé', '')).toBe('flabebe');
  });

  it('applies overrides', () => {
    expect(ok('Thundurus', 'Normal')).toBe('thundurus_incarnate');
    expect(ok('Tatsugiri', '')).toBe('tatsugiri_curly');
    expect(ok('Morpeko', '')).toBe('morpeko_full_belly');
    const r = mapSpecies('Gimmighoul', 'Roaming', false, index);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('unsupported-form');
    }
  });

  it('selects shadow variants and reports missing ones', () => {
    expect(ok('Rookidee', '', true)).toBe('rookidee_shadow');
    expect(ok('Quagsire', '', true)).toBe('quagsire_shadow');
    const r = mapSpecies('Azumarill', '', true, index);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('no-shadow-variant');
    }
  });

  it('maps every distinct name/form in the sample fixture except the known unsupported one', () => {
    const parsed = parsePokeGenieCsv(loadFixtureCsv());
    const seen = new Set<string>();
    const failures: string[] = [];
    for (const row of parsed.rows) {
      const key = `${row.name}|${row.form}|${row.shadowCode}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const r = mapSpecies(row.name, row.form, row.shadowCode === 1, index);
      if (!r.ok) {
        failures.push(`${key}: ${r.reason} (${r.tried})`);
      }
    }
    expect(failures.filter((f) => !f.startsWith('Gimmighoul|Roaming'))).toEqual([]);
  });

  it('walks evolution stages', () => {
    expect(index.stagesFrom('rookidee').map((s) => s.speciesId)).toEqual([
      'rookidee',
      'corvisquire',
      'corviknight',
    ]);
    expect(index.stagesFrom('marill').map((s) => s.speciesId)).toContain('azumarill');
    expect(index.stagesFrom('rookidee_shadow').map((s) => s.speciesId)).toContain(
      'corviknight_shadow',
    );
    expect(index.familyChainLength('azumarill')).toBe(3);
    expect(index.stageDepth('azumarill')).toBe(2);
    expect(index.stageDepth('rookidee')).toBe(0);
  });
});
