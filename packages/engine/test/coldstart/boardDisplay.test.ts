import { describe, expect, it } from 'vitest';
import { cautionNames, memberDisplay } from '../../src/coldstart/boardDisplay.js';

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
