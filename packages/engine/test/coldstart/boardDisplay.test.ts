import { describe, expect, it } from 'vitest';
import { cautionName, cautionNames, memberDisplay } from '../../src/coldstart/boardDisplay.js';

describe('memberDisplay', () => {
  it('keeps the Mega letter as its tag', () => {
    expect(memberDisplay('Charizard (Mega X)', 'charizard_mega_x')).toEqual({
      name: 'Charizard',
      sprite: 'charizard_mega_x',
      tags: [{ kind: 'mega', text: 'Mega X' }],
    });
    expect(memberDisplay('Venusaur (Mega)', 'venusaur_mega').tags).toEqual([
      { kind: 'mega', text: 'Mega' },
    ]);
  });

  it('shows a Shadow with the base sprite', () => {
    expect(memberDisplay('Kingdra (Shadow)', 'kingdra_shadow')).toEqual({
      name: 'Kingdra',
      sprite: 'kingdra',
      tags: [{ kind: 'shadow', text: 'Shadow' }],
    });
  });

  it('orders region before shadow and splits a regional form', () => {
    expect(memberDisplay('Marowak (Alolan) (Shadow)', 'marowak_alolan_shadow').tags).toEqual([
      { kind: 'region', text: 'Alolan' },
      { kind: 'shadow', text: 'Shadow' },
    ]);
    expect(memberDisplay('Darmanitan (Galarian Zen)', 'darmanitan_galarian_zen').tags).toEqual([
      { kind: 'region', text: 'Galarian' },
      { kind: 'form', text: 'Zen' },
    ]);
  });

  it('keeps any other form as a form tag', () => {
    expect(memberDisplay('Lycanroc (Midnight)', 'lycanroc_midnight')).toEqual({
      name: 'Lycanroc',
      sprite: 'lycanroc_midnight',
      tags: [{ kind: 'form', text: 'Midnight' }],
    });
    expect(memberDisplay('Mimikyu', 'mimikyu').tags).toEqual([]);
  });

  it('handles Type Null and Mime Jr. with name overrides', () => {
    expect(memberDisplay('Type (Null)', 'type_null')).toEqual({
      name: 'Type: Null',
      sprite: 'type_null',
      tags: [],
    });
    expect(memberDisplay('Mime (Jr)', 'mime_jr')).toEqual({
      name: 'Mime Jr.',
      sprite: 'mime_jr',
      tags: [],
    });
  });

  it('handles Primal and Mega Y', () => {
    expect(memberDisplay('Kyogre (Primal)', 'kyogre_primal')).toEqual({
      name: 'Kyogre',
      sprite: 'kyogre_primal',
      tags: [{ kind: 'mega', text: 'Primal' }],
    });
    expect(memberDisplay('Charizard (Mega Y)', 'charizard_mega_y')).toEqual({
      name: 'Charizard',
      sprite: 'charizard_mega_y',
      tags: [{ kind: 'mega', text: 'Mega Y' }],
    });
  });
});

describe('cautionNames', () => {
  it('drops a name already listed and stops at three', () => {
    const names: Record<string, string> = {
      kingdra: 'Kingdra',
      kingdra_shadow: 'Kingdra',
      a: 'Alpha',
      b: 'Beta',
      c: 'Gamma',
    };
    expect(
      cautionNames(['kingdra', 'kingdra_shadow', 'a', 'b', 'c'], (id) => names[id] ?? id),
    ).toEqual(['Kingdra', 'Alpha', 'Beta']);
  });
});

describe('cautionName', () => {
  it('keeps the region and the Mega tag, folds Shadow and drops other forms', () => {
    expect(cautionName('Corsola (Galarian)', 'corsola_galarian')).toBe('Galarian Corsola');
    expect(cautionName('Corsola', 'corsola')).toBe('Corsola');
    expect(cautionName('Marowak (Alolan) (Shadow)', 'marowak_alolan_shadow')).toBe(
      'Alolan Marowak',
    );
    expect(cautionName('Charizard (Mega X)', 'charizard_mega_x')).toBe('Mega Charizard X');
    expect(cautionName('Venusaur (Mega)', 'venusaur_mega')).toBe('Mega Venusaur');
    expect(cautionName('Kyogre (Primal)', 'kyogre_primal')).toBe('Primal Kyogre');
    expect(cautionName('Kingdra (Shadow)', 'kingdra_shadow')).toBe('Kingdra');
    expect(cautionName('Darmanitan (Galarian Zen)', 'darmanitan_galarian_zen')).toBe(
      'Galarian Darmanitan',
    );
  });
  it('still dedups a Shadow with its base through cautionNames', () => {
    const names: Record<string, [string, string]> = {
      a: ['Corsola (Galarian)', 'corsola_galarian'],
      b: ['Corsola', 'corsola'],
      c: ['Corsola (Galarian) (Shadow)', 'corsola_galarian_shadow'],
    };
    const nameOf = (id: string): string => cautionName(...names[id]!);
    expect(cautionNames(['a', 'b', 'c'], nameOf)).toEqual(['Galarian Corsola', 'Corsola']);
  });
});
